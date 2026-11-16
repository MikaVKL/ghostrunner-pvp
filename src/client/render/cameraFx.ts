/**
 * Camera effects for the first-person view: screen shake, wider field of view at speed,
 * tilt while wall-running, a dip when landing, a soft bob while running and a slump
 * when dead. Only looks - the simulation knows nothing about it.
 */
import { rightFromYaw } from '../../shared/math/vec3';
import { MOVE } from '../../shared/movement/movementConfig';
import type { PlayerState } from '../../shared/sim/playerState';
import { BASE_FOV } from './sceneSetup';

/** Camera tilt while wall-running, in radians. */
const WALL_RUN_ROLL = 0.2;
const DASH_FOV_BONUS = 16;
const WALL_RUN_FOV_BONUS = 6;

export interface CameraOffsets {
  /** Add to the camera position (meters). */
  x: number;
  y: number;
  z: number;
  /** Add to pitch / use as roll (radians). */
  pitch: number;
  roll: number;
  /** Field of view in degrees. */
  fov: number;
}

export class CameraFx {
  private shakeAmount = 0;
  private dip = 0;
  private roll = 0;
  private fov = BASE_FOV;
  private bobPhase = 0;
  private slump = 0;

  /** Shake the screen. `amount` is roughly the offset in meters (0.05 = light, 0.3 = heavy). */
  shake(amount: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** The camera dips down briefly, e.g. after landing. `amount` in meters. */
  bump(amount: number): void {
    this.dip = Math.max(this.dip, amount);
  }

  /** @param dt seconds since the last frame */
  update(p: PlayerState | null, yaw: number, dt: number): CameraOffsets {
    const blend = (rate: number) => 1 - Math.exp(-rate * dt); // frame-rate independent smoothing
    this.shakeAmount *= Math.exp(-9 * dt);
    this.dip *= Math.exp(-10 * dt);

    let targetRoll = 0;
    let targetFov = BASE_FOV;
    let bob = 0;
    if (p && p.alive) {
      const speed = Math.hypot(p.vel.x, p.vel.z);
      if (p.wallRunning) {
        const right = rightFromYaw(yaw);
        const wallIsOnTheRight = p.wallNormalX * right.x + p.wallNormalZ * right.z < 0;
        targetRoll = wallIsOnTheRight ? WALL_RUN_ROLL : -WALL_RUN_ROLL;
        targetFov += WALL_RUN_FOV_BONUS;
      }
      if (p.dashTicks > 0) targetFov += DASH_FOV_BONUS;
      targetFov += Math.max(0, speed - MOVE.runSpeed) * 0.5;
      if (p.grounded && speed > 1) {
        this.bobPhase += speed * dt * 1.6;
        bob = Math.sin(this.bobPhase * 2) * 0.025;
      }
      if (p.action === 'stunned') targetRoll += Math.sin(this.bobPhase + performance.now() / 90) * 0.05;
    }
    // Dead: the camera sinks to the ground and tips over.
    this.slump += ((p && !p.alive ? 1 : 0) - this.slump) * blend(p && !p.alive ? 4 : 30);
    this.roll += (targetRoll - this.roll) * blend(10);
    this.fov += (targetFov - this.fov) * blend(12);

    const s = this.shakeAmount;
    const jitter = () => (Math.random() * 2 - 1) * s;
    return {
      x: jitter(),
      y: jitter() + bob - this.dip - this.slump * 1.1,
      z: jitter(),
      pitch: jitter() * 0.5,
      roll: this.roll + jitter() * 0.5 + this.slump * 0.6,
      fov: this.fov,
    };
  }
}
