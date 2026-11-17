/**
 * Where the camera is while watching a replay:
 *   free     - fly around: mouse looks, W/A/S/D moves, Space up, Shift down
 *   follow   - behind one of the players, looking where it looks
 *   killcam  - behind the winner of the duel, looking at the loser
 */
import { forwardFromYaw, rightFromYaw, yawToward, type Vec3 } from '../../shared/math/vec3';
import { Button } from '../../shared/input';
import type { PlayerState } from '../../shared/sim/playerState';
import type { InputController } from '../input/inputController';

export type CameraMode = { kind: 'free' } | { kind: 'follow'; slot: number } | { kind: 'killcam'; killer: number; victim: number };

export interface CameraPose {
  /** Eye position. */
  pos: Vec3;
  yaw: number;
  pitch: number;
}

const FREE_SPEED = 10;

export class ReplayCamera {
  mode: CameraMode = { kind: 'free' };
  /** Jump straight to the next target instead of gliding there (after a mode change). */
  private snap = true;
  pose: CameraPose = { pos: { x: 0, y: 8, z: 12 }, yaw: 0, pitch: -0.4 };

  constructor(private readonly input: InputController) {}

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.snap = true;
    if (mode.kind === 'free') this.input.setView(this.pose.yaw, this.pose.pitch); // continue from here
  }

  /** German label for the camera button. */
  get label(): string {
    if (this.mode.kind === 'free') return 'Kamera: frei';
    if (this.mode.kind === 'follow') return `Kamera: Spieler ${this.mode.slot + 1}`;
    return 'Kamera: Killcam';
  }

  /** Move the camera for this frame. `dt` in seconds. */
  update(players: PlayerState[], dt: number): CameraPose {
    const target = this.targetPose(players, dt);
    if (this.mode.kind === 'free' || this.snap) {
      this.snap = false;
      return (this.pose = target);
    }
    // Glide toward the target instead of jumping, so following feels like a camera operator.
    const blend = 1 - Math.exp(-8 * dt);
    const p = this.pose.pos;
    this.pose = {
      pos: { x: p.x + (target.pos.x - p.x) * blend, y: p.y + (target.pos.y - p.y) * blend, z: p.z + (target.pos.z - p.z) * blend },
      yaw: target.yaw,
      pitch: target.pitch,
    };
    return this.pose;
  }

  private targetPose(players: PlayerState[], dt: number): CameraPose {
    const find = (slot: number) => players.find((p) => p.slot === slot);
    if (this.mode.kind === 'follow') {
      const p = find(this.mode.slot);
      if (!p) return this.pose;
      const back = forwardFromYaw(p.yaw);
      return { pos: { x: p.pos.x - back.x * 3.5, y: p.pos.y + 2.4, z: p.pos.z - back.z * 3.5 }, yaw: p.yaw, pitch: -0.3 };
    }
    if (this.mode.kind === 'killcam') {
      const killer = find(this.mode.killer);
      const victim = find(this.mode.victim);
      if (!killer || !victim) return this.pose;
      const away = forwardFromYaw(yawToward(victim.pos, killer.pos)); // from the victim past the killer
      const side = rightFromYaw(yawToward(killer.pos, victim.pos));
      // Behind the killer (further away from the victim) and a bit to the side, over its shoulder.
      const pos = { x: killer.pos.x + away.x * 3 + side.x * 1.2, y: killer.pos.y + 2.2, z: killer.pos.z + away.z * 3 + side.z * 1.2 };
      const look = { x: victim.pos.x, y: victim.pos.y + 1.1, z: victim.pos.z };
      const flat = Math.hypot(look.x - pos.x, look.z - pos.z);
      return { pos, yaw: yawToward(pos, look), pitch: Math.atan2(look.y - pos.y, flat) };
    }
    // Free flight with the normal game controls.
    const sample = this.input.sample();
    const forward = forwardFromYaw(this.input.yaw);
    const right = rightFromYaw(this.input.yaw);
    const up = (sample.buttons & Button.Jump ? 1 : 0) - (sample.buttons & Button.Dash ? 1 : 0);
    const step = FREE_SPEED * dt;
    const pos = this.pose.pos;
    return {
      pos: {
        x: pos.x + (forward.x * sample.moveZ + right.x * sample.moveX) * step,
        y: pos.y + (Math.sin(this.input.pitch) * sample.moveZ + up) * step,
        z: pos.z + (forward.z * sample.moveZ + right.z * sample.moveX) * step,
      },
      yaw: this.input.yaw,
      pitch: this.input.pitch,
    };
  }
}
