/**
 * Time trial: run from your spawn to the other spawn as fast as you can.
 *
 *   ready    -> standing at the start; the clock starts with the first step
 *   running  -> the clock runs (in ticks); the way is recorded for the ghost
 *   finished -> the goal was reached; `resultTicks` is the time
 *
 * Falling into the abyss puts the player back to the start (practice mode of the match
 * rules) - the trial notices the jump back and starts over.
 * Pure logic on PlayerState, no browser code: the browser part is client/app/timeTrialMode.ts.
 */
import { horizontalDistance, type Vec3 } from '../shared/math/vec3';
import type { PlayerState } from '../shared/sim/playerState';

export type TrialPhase = 'ready' | 'running' | 'finished';

/** One recorded moment of a run: [x, y, z, yaw]. */
export type GhostSample = [number, number, number, number];

/** The best run on a map: its time and the way it took (one sample per tick). */
export interface GhostRun {
  ticks: number;
  samples: GhostSample[];
}

/** Within this distance of the goal (and roughly at its height) the run is finished. */
export const GOAL_RADIUS = 2.5;
const GOAL_HEIGHT_TOLERANCE = 2;
/** Moving this far away from the start starts the clock. */
const START_DISTANCE = 0.3;
/** A jump of more than this in one tick is a teleport (respawn after a fall). */
const TELEPORT_DISTANCE = 3;

const round = (n: number) => Math.round(n * 1000) / 1000;

export class TimeTrial {
  phase: TrialPhase = 'ready';
  /** Ticks since the start (while running), or the final time (when finished). */
  ticks = 0;
  /** How often the player fell and had to start over. */
  restarts = 0;
  private samples: GhostSample[] = [];
  private last: Vec3 | null = null;

  constructor(
    readonly start: Vec3,
    readonly goal: Vec3,
  ) {}

  /** Call once per tick with the player. Returns what changed, if anything. */
  update(p: PlayerState): 'started' | 'finished' | 'restarted' | null {
    const teleported = this.last !== null && horizontalDistance(this.last, p.pos) > TELEPORT_DISTANCE;
    this.last = { ...p.pos };
    if (this.phase === 'finished') return null;
    if (teleported && this.phase === 'running') {
      this.phase = 'ready';
      this.ticks = 0;
      this.samples = [];
      this.restarts++;
      return 'restarted';
    }
    if (this.phase === 'ready') {
      if (horizontalDistance(p.pos, this.start) < START_DISTANCE) return null;
      this.phase = 'running';
      this.ticks = 0;
      this.samples = [];
      this.record(p);
      return 'started';
    }
    this.ticks++;
    this.record(p);
    if (this.atGoal(p)) {
      this.phase = 'finished';
      return 'finished';
    }
    return null;
  }

  /** The finished run as a ghost (null before the finish). */
  run(): GhostRun | null {
    return this.phase === 'finished' ? { ticks: this.ticks, samples: this.samples } : null;
  }

  atGoal(p: PlayerState): boolean {
    return horizontalDistance(p.pos, this.goal) < GOAL_RADIUS && Math.abs(p.pos.y - this.goal.y) < GOAL_HEIGHT_TOLERANCE;
  }

  private record(p: PlayerState): void {
    this.samples.push([round(p.pos.x), round(p.pos.y), round(p.pos.z), round(p.yaw)]);
  }
}

/** Where the ghost is `tick` ticks after its start (it waits at the goal afterwards). */
export function ghostAt(run: GhostRun, tick: number): { pos: Vec3; yaw: number; speed: number } | null {
  if (run.samples.length === 0) return null;
  const i = Math.max(0, Math.min(run.samples.length - 1, Math.floor(tick)));
  const [x, y, z, yaw] = run.samples[i];
  const [px, , pz] = run.samples[Math.max(0, i - 1)];
  return { pos: { x, y, z }, yaw, speed: Math.hypot(x - px, z - pz) * 60 };
}

/** Check a ghost loaded from storage; null if it is broken. */
export function parseGhost(raw: unknown): GhostRun | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const run = raw as Partial<GhostRun>;
  if (typeof run.ticks !== 'number' || !Array.isArray(run.samples)) return null;
  const valid = run.samples.every((s) => Array.isArray(s) && s.length === 4 && s.every((n) => typeof n === 'number'));
  return valid && run.ticks > 0 ? (run as GhostRun) : null;
}
