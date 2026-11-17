/**
 * Turns "something happened" into what the player sees and hears: particles, sounds,
 * screen shake, flashes and short messages. Nothing here changes the game.
 *
 * Three sources:
 *   moments     - a player started something (jump, dash, swing ...), see stateWatcher.ts
 *   game events - the server decided something (hit, parry, death ...)
 *   frame       - continuous effects (dash trail, wall-run sparks, countdown beeps)
 */
import type { GameEvent } from '../../shared/sim/events';
import type { PlayerState } from '../../shared/sim/playerState';
import type { MatchState } from '../../shared/sim/world';
import { forwardFromYaw, rightFromYaw, type Vec3 } from '../../shared/math/vec3';
import type { AudioEngine, Placement } from '../audio/audioEngine';
import { playSound, type SoundName } from '../audio/sounds';
import type { GameView } from '../render/gameView';
import { FX_COLORS, teamColor } from '../render/palette';
import { secondsLeft, TEXT } from '../ui/hudTexts';
import type { Hud } from '../ui/hud';
import type { Moment } from './stateWatcher';

/** Where the local player's ears are. */
export interface Listener {
  pos: Vec3;
  yaw: number;
}

const MOMENT_SOUNDS: Partial<Record<Moment, SoundName>> = {
  jump: 'jump',
  doubleJump: 'doubleJump',
  padLaunch: 'padLaunch',
  wallJump: 'wallJump',
  land: 'land',
  dash: 'dash',
  swing: 'swing',
  swingDash: 'swingDash',
  stunned: 'stunned',
};

const chest = (p: PlayerState): Vec3 => ({ x: p.pos.x, y: p.pos.y + 1.1, z: p.pos.z });
const feet = (p: PlayerState): Vec3 => ({ x: p.pos.x, y: p.pos.y + 0.1, z: p.pos.z });

export class Effects {
  private lastCountdown = -1;
  /** Wind-up cue on/off (set every frame by the game loop). */
  windupCue = false;
  /** How many wind-up cues were played (browser tests read it). */
  windupCues = 0;

  constructor(
    private readonly view: GameView,
    private readonly hud: Hud,
    private readonly audio: AudioEngine,
  ) {}

  /** Stereo position and loudness of a sound at `pos` for the listener. */
  private place(listener: Listener, pos: Vec3): Placement {
    const dx = pos.x - listener.pos.x;
    const dz = pos.z - listener.pos.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.5) return { pan: 0, gain: 1 };
    const right = rightFromYaw(listener.yaw);
    return { pan: ((dx * right.x + dz * right.z) / distance) * 0.8, gain: 1 / (1 + distance / 10) };
  }

  /** A player started something. `listener` is null for the local player (sound in the middle). */
  moment(moment: Moment, p: PlayerState, listener: Listener | null): void {
    const sound = MOMENT_SOUNDS[moment];
    if (sound) playSound(this.audio, sound, listener ? this.place(listener, p.pos) : undefined);
    // An enemy starts a swing: warn with a short tone (the ring is drawn by the avatar).
    if (listener && this.windupCue && (moment === 'swing' || moment === 'swingDash')) {
      playSound(this.audio, 'windup', this.place(listener, p.pos));
      this.windupCues++;
    }
    const particles = this.view.particles;
    const color = teamColor(p.slot);

    if (moment === 'dash') {
      const back = forwardFromYaw(p.yaw);
      particles.burst({ pos: chest(p), count: 26, color, speed: 6, life: 0.35, dir: { x: -back.x, y: 0, z: -back.z }, spread: 0.6 });
    }
    if (moment === 'land') {
      particles.burst({ pos: feet(p), count: 16, color: FX_COLORS.dust, speed: 2.6, life: 0.45, gravity: 3, dir: { x: 0, y: 0.3, z: 0 }, spread: 0.9 });
      if (!listener) this.view.cameraFx.bump(0.14);
    }
    if (moment === 'jump' || moment === 'wallJump') {
      particles.burst({ pos: feet(p), count: 8, color: FX_COLORS.dust, speed: 1.8, life: 0.3, gravity: 3 });
    }
    if (moment === 'doubleJump') {
      // A ring of sparks under the feet.
      particles.burst({ pos: feet(p), count: 22, color, speed: 3.5, life: 0.35, dir: { x: 0, y: -0.2, z: 0 }, spread: 0.85 });
    }
    if (moment === 'padLaunch') {
      particles.burst({ pos: feet(p), count: 40, color: FX_COLORS.pad, speed: 7, life: 0.5, dir: { x: 0, y: 1, z: 0 }, spread: 0.45 });
      if (!listener) this.view.cameraFx.shake(0.06);
    }
    if (moment === 'wallJump' && !listener) this.view.cameraFx.shake(0.04);
  }

  /** The server decided something. `players` = everyone as currently displayed. */
  gameEvent(event: GameEvent, mySlot: number, players: PlayerState[], listener: Listener): void {
    const find = (slot: number) => players.find((p) => p.slot === slot) ?? null;
    switch (event.type) {
      case 'hit': {
        const target = find(event.target);
        const where = target ? chest(target) : listener.pos;
        this.view.particles.burst({ pos: where, count: 80, color: FX_COLORS.hit, speed: 9, life: 0.7, gravity: 12 });
        this.view.particles.burst({ pos: where, count: 30, color: FX_COLORS.hitCore, speed: 5, life: 0.3 });
        if (event.target === mySlot) {
          playSound(this.audio, 'death');
          this.hud.flash('damage');
          this.view.cameraFx.shake(0.35);
        } else {
          playSound(this.audio, 'hit', this.place(listener, where));
          this.view.cameraFx.shake(0.12);
          if (event.attacker === mySlot) this.hud.toast(TEXT.hit, 500);
        }
        return;
      }
      case 'parry': {
        const a = find(event.attacker);
        const d = find(event.defender);
        // Sparks fly where the blades met: between the two fighters.
        const where = a && d ? { x: (a.pos.x + d.pos.x) / 2, y: (a.pos.y + d.pos.y) / 2 + 1.2, z: (a.pos.z + d.pos.z) / 2 } : listener.pos;
        this.view.particles.burst({ pos: where, count: 70, color: FX_COLORS.parry, speed: 11, life: 0.5, gravity: 7 });
        this.view.particles.burst({ pos: where, count: 20, color: FX_COLORS.hitCore, speed: 4, life: 0.25 });
        playSound(this.audio, 'parry', this.place(listener, where));
        this.hud.flash('parry');
        this.view.cameraFx.shake(0.18);
        this.hud.toast(event.attacker === mySlot ? TEXT.gotParried : TEXT.parried, 1100);
        return;
      }
      case 'clash': {
        const a = find(event.a);
        const b = find(event.b);
        const where = a && b ? { x: (a.pos.x + b.pos.x) / 2, y: (a.pos.y + b.pos.y) / 2 + 1.2, z: (a.pos.z + b.pos.z) / 2 } : listener.pos;
        this.view.particles.burst({ pos: where, count: 90, color: FX_COLORS.clash, speed: 12, life: 0.55, gravity: 8 });
        this.view.particles.burst({ pos: where, count: 30, color: FX_COLORS.hitCore, speed: 5, life: 0.25 });
        playSound(this.audio, 'clash', this.place(listener, where));
        this.view.cameraFx.shake(0.22);
        if (event.a === mySlot || event.b === mySlot) {
          this.hud.flash('parry');
          this.hud.toast(TEXT.clash, 800);
        }
        return;
      }
      case 'death':
        if (event.cause !== 'fall') return;
        playSound(this.audio, 'fall', event.slot === mySlot ? undefined : { pan: 0, gain: 0.5 });
        if (event.slot === mySlot) this.hud.flash('damage');
        this.hud.toast(event.slot === mySlot ? TEXT.fell : TEXT.enemyFell, 1200);
        return;
      case 'roundStart':
        playSound(this.audio, 'go');
        this.hud.toast(TEXT.fight, 800);
        return;
      case 'roundEnd':
        if (event.winner >= 0) playSound(this.audio, event.winner === mySlot ? 'roundWon' : 'roundLost');
        return;
      case 'matchEnd':
        if (event.winner >= 0) playSound(this.audio, event.winner === mySlot ? 'matchWon' : 'matchLost');
        return;
    }
  }

  /** Continuous effects. Call once per frame. */
  frame(me: PlayerState | null, remotes: PlayerState[], match: MatchState | null): void {
    for (const p of me ? [me, ...remotes] : remotes) {
      if (!p.alive) continue;
      if (p.dashTicks > 0) {
        this.view.particles.burst({ pos: chest(p), count: 3, color: teamColor(p.slot), speed: 1.2, life: 0.3 });
      }
      if (p.wallRunning) {
        // Sparks where the feet scrape along the wall.
        const pos = { x: p.pos.x - p.wallNormalX * 0.4, y: p.pos.y + 0.15, z: p.pos.z - p.wallNormalZ * 0.4 };
        this.view.particles.burst({ pos, count: 2, color: teamColor(p.slot), speed: 2.5, life: 0.3, gravity: 6, dir: { x: p.wallNormalX, y: 0.2, z: p.wallNormalZ }, spread: 0.7 });
      }
    }
    this.audio.setScrape(me !== null && me.alive && me.wallRunning);

    // One beep per second of the countdown.
    const countdown = match?.phase === 'countdown' ? secondsLeft(match.phaseTicksLeft) : -1;
    if (countdown !== this.lastCountdown && countdown > 0) playSound(this.audio, 'countdown');
    this.lastCountdown = countdown;
  }
}
