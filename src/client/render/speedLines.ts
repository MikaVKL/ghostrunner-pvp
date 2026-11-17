/**
 * Speed lines: thin glowing streaks that rush past the edge of the view when the player
 * is fast (dash, slide, wall-run, flying from a jump pad). They are attached to the
 * camera and arranged in a tube around the view direction, so the middle of the screen
 * stays clear. Only looks; can be switched off in the menu.
 */
import * as THREE from 'three';
import { MOVE } from '../../shared/movement/movementConfig';
import type { PlayerState } from '../../shared/sim/playerState';

const LINE_COUNT = 70;
/** The tube: distance from the view axis (meters at 1 m in front of the camera = screen edge). */
const INNER_RADIUS = 1.4;
const OUTER_RADIUS = 3.2;
/** Lines are spawned this far in front of the camera and fly toward it. */
const FAR = 14;
const NEAR = 0.5;
/** Fastest flying speed of the lines in m/s (at full intensity). */
const LINE_SPEED = 60;

/** 0 = no lines, 1 = full streaks. Pure function (unit tested). */
export function speedLineIntensity(p: PlayerState | null): number {
  if (!p || !p.alive) return 0;
  if (p.dashTicks > 0) return 1;
  const speed = Math.hypot(p.vel.x, p.vel.z, Math.min(0, p.vel.y));
  const start = MOVE.runSpeed + 0.5;
  const full = MOVE.dashSpeed * 0.75;
  return Math.min(1, Math.max(0, (speed - start) / (full - start)));
}

export class SpeedLines {
  readonly lines: THREE.LineSegments;
  private readonly material: THREE.LineBasicMaterial;
  private readonly positions: Float32Array;
  /** Per line: angle around the axis, radius, depth (z, negative = in front), length. */
  private readonly lineData: { angle: number; radius: number; z: number; length: number }[] = [];
  private intensity = 0;

  constructor() {
    this.positions = new Float32Array(LINE_COUNT * 6);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0xd8f4ff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.lines = new THREE.LineSegments(geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 10;
    for (let i = 0; i < LINE_COUNT; i++) {
      this.lineData.push({ angle: 0, radius: 0, z: 0, length: 0 });
      this.respawn(i, -NEAR - Math.random() * (FAR - NEAR));
    }
  }

  private respawn(i: number, z: number): void {
    const line = this.lineData[i];
    line.angle = Math.random() * Math.PI * 2;
    line.radius = INNER_RADIUS + Math.random() * (OUTER_RADIUS - INNER_RADIUS);
    line.z = z;
    line.length = 0.8 + Math.random() * 2.2;
  }

  /** @param dt seconds since the last frame; `enabled` = the setting */
  update(p: PlayerState | null, dt: number, enabled: boolean): void {
    const target = enabled ? speedLineIntensity(p) : 0;
    // Quick to appear, a bit slower to fade.
    this.intensity += (target - this.intensity) * (1 - Math.exp(-(target > this.intensity ? 14 : 5) * dt));
    this.lines.visible = this.intensity > 0.02;
    if (!this.lines.visible) return;
    this.material.opacity = 0.55 * this.intensity;

    const move = LINE_SPEED * (0.4 + 0.6 * this.intensity) * dt;
    for (let i = 0; i < LINE_COUNT; i++) {
      const line = this.lineData[i];
      line.z += move;
      if (line.z > -NEAR) this.respawn(i, -FAR + Math.random() * 2);
      // The radius grows with depth so the tube looks the same size on screen everywhere.
      const r = line.radius * -line.z * 0.35;
      const x = Math.cos(line.angle) * r;
      const y = Math.sin(line.angle) * r * 0.62; // flatter: the screen is wider than high
      const length = line.length * this.intensity;
      const o = i * 6;
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = line.z;
      // Same sideways offset but deeper: on screen the streak points toward the middle.
      this.positions[o + 3] = x;
      this.positions[o + 4] = y;
      this.positions[o + 5] = line.z - length;
    }
    (this.lines.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }
}
