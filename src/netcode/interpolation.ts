/**
 * Smooth display of OTHER players.
 *
 * Snapshots arrive only 30 times per second and not perfectly evenly. Instead of showing
 * the newest one (jerky), we show the world slightly in the past and blend between the
 * two snapshots around that moment.
 */
import { TICK_MS } from '../shared/config';
import { lerpAngle } from '../shared/math/scalar';
import { lerpVec3 } from '../shared/math/vec3';
import type { PlayerState } from '../shared/sim/playerState';

/** Other players are shown this many ticks in the past (6 ticks = 100 ms). */
export const INTERPOLATION_DELAY_TICKS = 6;
const MAX_STORED_SNAPSHOTS = 32;

interface StoredSnapshot {
  tick: number;
  players: PlayerState[];
}

/** Keeps the most recent snapshots and blends between them. */
export class SnapshotBuffer {
  private items: StoredSnapshot[] = [];

  clear(): void {
    this.items = [];
  }

  push(tick: number, players: PlayerState[]): void {
    this.items.push({ tick, players });
    if (this.items.length > MAX_STORED_SNAPSHOTS) this.items.shift();
  }

  /** State of the player in `slot` at the (fractional) server tick `renderTick`. */
  sample(renderTick: number, slot: number): PlayerState | null {
    const items = this.items;
    if (items.length === 0) return null;
    const find = (s: StoredSnapshot) => s.players.find((p) => p.slot === slot) ?? null;

    const newest = items[items.length - 1];
    if (renderTick >= newest.tick) return find(newest);
    if (renderTick <= items[0].tick) return find(items[0]);

    for (let i = items.length - 2; i >= 0; i--) {
      if (items[i].tick > renderTick) continue;
      const older = find(items[i]);
      const newer = find(items[i + 1]);
      if (!older || !newer) return newer ?? older;
      const t = (renderTick - items[i].tick) / (items[i + 1].tick - items[i].tick);
      return {
        ...older,
        pos: lerpVec3(older.pos, newer.pos, t),
        yaw: lerpAngle(older.yaw, newer.yaw, t),
        pitch: lerpAngle(older.pitch, newer.pitch, t),
      };
    }
    return find(newest);
  }
}

/**
 * Decides which server tick to display right now. It runs at real-time speed and is
 * gently steered toward "newest snapshot minus the interpolation delay".
 */
export class RenderClock {
  renderTick = 0;
  private started = false;

  reset(): void {
    this.started = false;
  }

  /** Call every frame with the time since the last frame. */
  advance(deltaMs: number): void {
    if (this.started) this.renderTick += deltaMs / TICK_MS;
  }

  /** Call for every received snapshot. */
  onSnapshot(serverTick: number): void {
    const target = serverTick - INTERPOLATION_DELAY_TICKS;
    const error = target - this.renderTick;
    if (!this.started || Math.abs(error) > 30) {
      this.renderTick = target; // first snapshot or way off: jump
      this.started = true;
    } else {
      this.renderTick += error * 0.05; // small drift: correct softly
    }
  }
}
