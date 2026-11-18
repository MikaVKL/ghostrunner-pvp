/**
 * The replay viewer: plays a recorded match (shared/replay) in the 3D view with pause,
 * slow motion, spooling, free camera, export - and the killcam after a kill in solo.
 *
 * While the viewer is open the game loop draws the replay instead of the match
 * (gameLoop.ts asks `active`). In solo mode the match is frozen meanwhile.
 */
import { PROTOCOL_VERSION } from '../../shared/config';
import { getMap } from '../../shared/maps';
import { getMode, type GameMode } from '../../shared/match/gameModes';
import type { ReplayFile } from '../../shared/replay/replayFormat';
import { ReplayPlayback } from '../../shared/replay/replayPlayback';
import { hashState } from '../../shared/sim/stateDiff';
import { EYE_HEIGHT } from '../../shared/physics/collision';
import type { Effects } from '../app/effects';
import { detectMoments } from '../app/stateWatcher';
import type { InputController } from '../input/inputController';
import type { GameView, ViewState } from '../render/gameView';
import { ReplayCamera } from './replayCamera';
import { ReplayControls } from './replayControls';
import { downloadReplay, livesLine, replayTitle } from './replayFiles';

/** The killcam shows this many ticks before the kill, at KILLCAM_SPEED. */
const KILLCAM_TICKS = 150;
const KILLCAM_SPEED = 0.35;

export interface KillcamTarget {
  killer: number;
  victim: number;
}

export class ReplayViewer {
  private playback: ReplayPlayback | null = null;
  private file: ReplayFile | null = null;
  /** Rules of the replayed match (lives display, wind-up cue). */
  private mode: GameMode = getMode('duel');
  private readonly camera: ReplayCamera;
  private readonly controls: ReplayControls;
  private killcam = false;
  private check = '';
  /** Called when the viewer closes (to show the game or the menu again). */
  private onClose: () => void = () => {};

  constructor(
    private readonly view: GameView,
    private readonly input: InputController,
    private readonly effects: Effects,
    /** Is the wind-up cue on for a match of this mode? (player setting, see settings.ts) */
    private readonly windupCueFor: (mode: GameMode) => boolean,
    /** Look-and-feel settings (see settings.ts). */
    private readonly fx: () => ViewState['fx'],
  ) {
    this.camera = new ReplayCamera(input);
    this.controls = new ReplayControls({
      togglePause: () => this.playback?.togglePause(),
      seekBySeconds: (s) => this.playback?.seekBySeconds(s),
      seekToFraction: (f) => this.playback && this.playback.seekTo(this.playback.sim.firstTick + f * (this.playback.sim.lastTick - this.playback.sim.firstTick)),
      changeSpeed: (d) => this.playback?.changeSpeed(d),
      nextCamera: () => this.nextCamera(),
      exportFile: () => this.file && downloadReplay(this.file),
      close: () => this.close(),
    });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('mousedown', this.onMouse);
  }

  get active(): boolean {
    return this.playback !== null;
  }

  /** Watch a whole replay, starting at the beginning. */
  open(file: ReplayFile, onClose: () => void): void {
    this.start(file, new ReplayPlayback(file), false, onClose);
    this.camera.setMode({ kind: 'follow', slot: 0 });
    this.check = file.protocol === PROTOCOL_VERSION ? '' : 'Achtung: aus einer anderen Spielversion – kann abweichen.';
  }

  /** Show the last moments before a kill in slow motion, then call `onClose`. */
  openKillcam(file: ReplayFile, target: KillcamTarget, onClose: () => void): void {
    const end = file.startWorld.tick + file.ticks.length;
    const playback = new ReplayPlayback(file, end - KILLCAM_TICKS, end);
    playback.speed = KILLCAM_SPEED;
    this.start(file, playback, true, onClose);
    this.camera.setMode({ kind: 'killcam', ...target });
  }

  close(): void {
    if (!this.playback) return;
    this.playback = null;
    this.file = null;
    this.controls.hide();
    this.onClose();
  }

  /** Draw one frame. `deltaMs` = real time since the last frame. */
  frame(deltaMs: number): void {
    const playback = this.playback;
    if (!playback) return;
    const frame = playback.advance(deltaMs);
    const pose = this.camera.update(frame.players, deltaMs / 1000);
    const listener = { pos: pose.pos, yaw: pose.yaw };
    const cue = this.windupCueFor(this.mode);
    this.effects.windupCue = cue;
    for (const p of frame.current) {
      const before = frame.previous.find((q) => q.slot === p.slot);
      if (before) for (const moment of detectMoments(before, p)) this.effects.moment(moment, p, listener);
    }
    for (const event of frame.events) this.effects.gameEvent(event, -1, frame.players, listener);
    this.effects.frame(null, frame.players, null);
    const feet = { x: pose.pos.x, y: pose.pos.y - EYE_HEIGHT, z: pose.pos.z };
    const animMs = this.effects.hitstop.advance(deltaMs);
    this.view.render({
      localPos: feet,
      yaw: pose.yaw,
      pitch: pose.pitch,
      local: null,
      remotes: frame.players,
      dt: deltaMs / 1000,
      animDt: animMs / 1000,
      windupCue: cue,
      fx: this.fx(),
      combatLive: true,
    });
    this.updateCheck(playback);
    const lives = this.file ? livesLine(this.file, frame.current, this.mode.lives) : '';
    this.controls.update(playback, this.camera.label, this.check, lives);
    if (this.killcam && playback.finished) this.close();
  }

  /** For the browser tests and the console: the playback, or null. */
  get state(): ReplayPlayback | null {
    return this.playback;
  }

  private start(file: ReplayFile, playback: ReplayPlayback, killcam: boolean, onClose: () => void): void {
    this.playback = playback;
    this.file = file;
    this.mode = getMode(file.modeId);
    this.killcam = killcam;
    this.onClose = onClose;
    this.view.setMap(getMap(file.mapId));
    this.controls.show(replayTitle(file), killcam);
  }

  /** Once the end is reached: is the calculated match identical to the recording? */
  private updateCheck(playback: ReplayPlayback): void {
    const { sim } = playback;
    if (sim.mismatches.length > 0) {
      this.check = `⚠ Weicht ab Tick ${sim.mismatches[0].tick} von der Aufnahme ab (andere Spielversion?)`;
    } else if (sim.atEnd && this.file && !this.killcam && !this.check.startsWith('✓')) {
      this.check = sim.verifyAll() && hashState(sim.world) === this.file.finalHash
        ? '✓ Geprüft: identisch mit der Aufnahme'
        : '⚠ Endstand weicht von der Aufnahme ab';
    }
  }

  private nextCamera(): void {
    const m = this.camera.mode;
    if (m.kind === 'free') this.camera.setMode({ kind: 'follow', slot: 0 });
    else if (m.kind === 'follow' && m.slot === 0) this.camera.setMode({ kind: 'follow', slot: 1 });
    else this.camera.setMode({ kind: 'free' });
  }

  private onKey = (event: KeyboardEvent): void => {
    if (!this.playback || event.repeat) return;
    // Handled here: no other key handler (game, help ...) may see this key.
    event.stopImmediatePropagation();
    if (this.killcam) return this.close(); // any key skips the killcam
    const actions: Record<string, () => void> = {
      KeyP: () => this.playback?.togglePause(),
      Comma: () => this.playback?.seekBySeconds(-5),
      Period: () => this.playback?.seekBySeconds(5),
      BracketLeft: () => this.playback?.changeSpeed(-1),
      BracketRight: () => this.playback?.changeSpeed(1),
      KeyC: () => this.nextCamera(),
      KeyB: () => this.close(),
    };
    actions[event.code]?.();
  };

  private onMouse = (): void => {
    if (this.killcam) this.close();
  };
}
