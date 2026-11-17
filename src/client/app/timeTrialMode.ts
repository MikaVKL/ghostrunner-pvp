/**
 * The time trial in the browser: starts a TrialRun (solo/trialRun.ts), shows the clock
 * and messages in the HUD, the goal beam and the ghost of the best run, and saves a new
 * best time. `R` starts over.
 */
import type { GameClient } from '../../netcode/gameClient';
import { getMap } from '../../shared/maps';
import { forwardFromYaw } from '../../shared/math/vec3';
import { createPlayer, type PlayerState } from '../../shared/sim/playerState';
import { ghostAt, type GhostRun } from '../../solo/timeTrial';
import { TrialRun } from '../../solo/trialRun';
import type { GameView } from '../render/gameView';
import type { Hud, TrialHudInfo } from '../ui/hud';
import { TEXT } from '../ui/hudTexts';
import { formatTicks, loadBestRun, saveBestRun } from './trialStorage';

export class TimeTrialMode {
  private run: TrialRun | null = null;
  private best: GhostRun | null = null;
  /** The previous best when the last run set a new record (for the message). */
  private beaten: GhostRun | null = null;
  private newRecord = false;

  constructor(
    private readonly hud: Hud,
    private readonly view: GameView,
    /** Connects a client's callbacks to the screen (gameApp.ts). */
    private readonly bind: (client: GameClient) => void,
    private readonly predict: boolean,
  ) {}

  get active(): boolean {
    return this.run !== null;
  }

  get client(): GameClient | null {
    return this.run?.client ?? null;
  }

  start(name: string, mapId: string): void {
    this.best = loadBestRun(mapId);
    this.newRecord = false;
    this.run = new TrialRun(name, mapId, this.predict);
    this.bind(this.run.client);
    this.run.start();
    this.view.setGoal(getMap(mapId).spawns[1].pos);
    this.hud.setSoloLabel('Zeitrennen', false);
    this.showInfo();
  }

  /** Start over from the spawn (key R). */
  restart(): void {
    const old = this.run;
    if (!old) return;
    old.client.onRoomLeft = () => {}; // leaving the old session must not end the time trial
    const name = old.client.room?.players[0]?.name ?? 'Spieler';
    old.dispose();
    this.start(name, old.mapId);
  }

  /** The player left: clean up (called from the client's onRoomLeft). */
  end(): void {
    this.run?.dispose();
    this.run = null;
    this.view.setGoal(null);
    this.hud.setTrial(null);
    this.hud.setSoloLabel(null);
  }

  /** One tick: local server + clock. Call after client.tick(). */
  step(): void {
    if (!this.run) return;
    if (this.run.step() === 'finished') this.finish(this.run);
    this.showInfo();
  }

  /** The ghost of the best run at the current time, or null. */
  ghost(): PlayerState | null {
    const trial = this.run?.trial;
    if (!this.best || !trial) return null;
    const sample = ghostAt(this.best, trial.phase === 'ready' ? 0 : trial.ticks);
    if (!sample) return null;
    const ghost = createPlayer(1, { pos: sample.pos, yaw: sample.yaw });
    const forward = forwardFromYaw(sample.yaw);
    ghost.vel = { x: forward.x * sample.speed, y: 0, z: forward.z * sample.speed };
    ghost.grounded = true;
    return ghost;
  }

  private finish(run: TrialRun): void {
    const result = run.trial.run()!;
    this.newRecord = !this.best || result.ticks < this.best.ticks;
    if (!this.newRecord) return;
    this.beaten = this.best;
    this.best = result;
    saveBestRun(run.mapId, result);
  }

  private showInfo(): void {
    const trial = this.run?.trial;
    if (!trial) return;
    const best = this.best ? `Bestzeit ${formatTicks(this.best.ticks)}` : 'Noch keine Bestzeit';
    const info: TrialHudInfo = { main: '', sub: '', label: 'Zeitrennen', timer: formatTicks(trial.ticks) };
    if (trial.phase === 'ready') {
      info.main = TEXT.trialReady;
      info.sub = `${this.best ? `${best} · der Geist läuft mit` : TEXT.trialGoal}`;
      info.timer = formatTicks(0);
    } else if (trial.phase === 'running') {
      info.sub = `${best} · ${TEXT.trialRestart}`;
    } else {
      info.main = `ZIEL! ${formatTicks(trial.ticks)}`;
      info.sub = this.newRecord
        ? `Neue Bestzeit!${this.beaten ? ` (vorher ${formatTicks(this.beaten.ticks)})` : ''} · ${TEXT.trialRestart}`
        : `${best} · ${TEXT.trialRestart}`;
    }
    this.hud.setTrial(info);
  }
}
