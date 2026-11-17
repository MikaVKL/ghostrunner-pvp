/**
 * Plays a replay like a video: a clock that runs at an adjustable speed, can be paused
 * and moved, and gives smooth in-between pictures for slow motion.
 *
 * Pure logic without any browser code (the time per frame is passed in), so it can be
 * tested in Node. The browser part is in src/client/replay/.
 */
import { TICK_MS } from '../config';
import { lerpAngle } from '../math/scalar';
import { lerpVec3 } from '../math/vec3';
import type { GameEvent } from '../sim/events';
import { clonePlayer, type PlayerState } from '../sim/playerState';
import type { ReplayFile } from './replayFormat';
import { ReplaySimulator } from './replaySimulator';

export const PLAYBACK_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 4];

export interface PlaybackFrame {
  /** Players for drawing, blended between two ticks. */
  players: PlayerState[];
  /** Players exactly at the current tick and one tick before (to notice jumps, swings ...). */
  current: PlayerState[];
  previous: PlayerState[];
  /** Events of the ticks that were passed since the last frame (empty after a jump). */
  events: GameEvent[];
}

export class ReplayPlayback {
  readonly sim: ReplaySimulator;
  playing = true;
  speed = 1;
  /** Stop at this tick (killcam); defaults to the end of the recording. */
  endTick: number;
  /** Playback position in (fractional) ticks. */
  private position: number;
  private previous: PlayerState[];
  private jumped = true;

  constructor(file: ReplayFile, startTick?: number, endTick?: number) {
    this.sim = new ReplaySimulator(file);
    this.endTick = Math.min(endTick ?? this.sim.lastTick, this.sim.lastTick);
    this.position = this.sim.firstTick;
    this.previous = this.sim.world.players.map(clonePlayer);
    if (startTick !== undefined) this.seekTo(startTick);
  }

  get tick(): number {
    return this.position;
  }

  get finished(): boolean {
    return this.position >= this.endTick;
  }

  togglePause(): void {
    if (this.finished) this.seekTo(this.sim.firstTick); // play again from the start
    this.playing = !this.playing || this.finished;
  }

  /** Next faster (+1) or slower (-1) speed from PLAYBACK_SPEEDS. */
  changeSpeed(direction: 1 | -1): void {
    const index = PLAYBACK_SPEEDS.indexOf(this.speed);
    const next = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, (index < 0 ? 3 : index) + direction));
    this.speed = PLAYBACK_SPEEDS[next];
  }

  seekTo(tick: number): void {
    this.position = Math.max(this.sim.firstTick, Math.min(this.endTick, tick));
    this.sim.seek(Math.ceil(this.position));
    this.previous = this.sim.world.players.map(clonePlayer);
    this.jumped = true;
  }

  seekBySeconds(seconds: number): void {
    this.seekTo(this.position + (seconds * 1000) / TICK_MS);
  }

  /** Advance the clock by `deltaMs` of real time and return what to draw. */
  advance(deltaMs: number): PlaybackFrame {
    const events: GameEvent[] = [];
    if (this.playing && !this.finished) {
      this.position = Math.min(this.endTick, this.position + (deltaMs / TICK_MS) * this.speed);
      while (this.sim.tick < Math.ceil(this.position)) {
        this.previous = this.sim.world.players.map(clonePlayer);
        events.push(...this.sim.step());
      }
      if (this.finished) this.playing = false;
    }
    const current = this.sim.world.players;
    const jumped = this.jumped;
    this.jumped = false;
    // How far between the previous and the current tick the clock is (0..1).
    const t = 1 - (this.sim.tick - this.position);
    const players = current.map((p) => {
      const before = this.previous.find((q) => q.slot === p.slot);
      if (!before || jumped || before.alive !== p.alive) return p;
      return { ...p, pos: lerpVec3(before.pos, p.pos, t), yaw: lerpAngle(before.yaw, p.yaw, t), pitch: lerpAngle(before.pitch, p.pitch, t) };
    });
    return { players, current, previous: jumped ? current : this.previous, events: jumped ? [] : events };
  }
}
