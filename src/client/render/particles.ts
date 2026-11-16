/**
 * A small particle system for sparks and dust. All particles live in ONE object with a
 * fixed number of slots (a "pool"), so spawning thousands of them over time creates no
 * garbage. Particles glow (additive blending) and fade by getting darker.
 *
 * Randomness here is only for looks, so Math.random() is fine (this is not game logic).
 */
import * as THREE from 'three';
import type { Vec3 } from '../../shared/math/vec3';

const MAX_PARTICLES = 900;

export interface BurstOptions {
  pos: Vec3;
  count: number;
  color: number;
  /** Fastest start speed in m/s (each particle gets a random share of it). */
  speed: number;
  /** Lifetime in seconds. */
  life: number;
  /** Downward acceleration in m/s^2. */
  gravity?: number;
  /** If set, particles fly mostly in this direction instead of everywhere. */
  dir?: { x: number; y: number; z: number };
  /** 0 = exactly along `dir`, 1 = anywhere. */
  spread?: number;
}

export class Particles {
  readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_PARTICLES * 3);
  private readonly colors = new Float32Array(MAX_PARTICLES * 3);
  private readonly velocities = new Float32Array(MAX_PARTICLES * 3);
  private readonly baseColors = new Float32Array(MAX_PARTICLES * 3);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly gravity = new Float32Array(MAX_PARTICLES);
  private next = 0;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.09,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false; // particles are everywhere; never skip drawing them
  }

  burst(options: BurstOptions): void {
    const color = new THREE.Color(options.color);
    const spread = options.dir ? (options.spread ?? 0.5) : 1;
    for (let n = 0; n < options.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_PARTICLES;
      // Random direction on a sphere, blended with the wanted direction.
      const angle = Math.random() * Math.PI * 2;
      const up = Math.random() * 2 - 1;
      const flat = Math.sqrt(1 - up * up);
      let dx = Math.cos(angle) * flat * spread + (options.dir?.x ?? 0) * (1 - spread);
      let dy = up * spread + (options.dir?.y ?? 0) * (1 - spread);
      let dz = Math.sin(angle) * flat * spread + (options.dir?.z ?? 0) * (1 - spread);
      const length = Math.hypot(dx, dy, dz) || 1;
      const speed = options.speed * (0.25 + Math.random() * 0.75);
      dx = (dx / length) * speed;
      dy = (dy / length) * speed;
      dz = (dz / length) * speed;

      this.positions.set([options.pos.x, options.pos.y, options.pos.z], i * 3);
      this.velocities.set([dx, dy, dz], i * 3);
      this.baseColors.set([color.r, color.g, color.b], i * 3);
      this.maxLife[i] = this.life[i] = options.life * (0.5 + Math.random() * 0.5);
      this.gravity[i] = options.gravity ?? 0;
    }
  }

  /** Move and fade all particles. @param dt seconds since the last frame */
  update(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const a = i * 3;
      const fade = Math.max(0, this.life[i] / this.maxLife[i]);
      this.velocities[a + 1] -= this.gravity[i] * dt;
      this.positions[a] += this.velocities[a] * dt;
      this.positions[a + 1] += this.velocities[a + 1] * dt;
      this.positions[a + 2] += this.velocities[a + 2] * dt;
      this.colors[a] = this.baseColors[a] * fade;
      this.colors[a + 1] = this.baseColors[a + 1] * fade;
      this.colors[a + 2] = this.baseColors[a + 2] * fade;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }
}
