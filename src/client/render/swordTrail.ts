/**
 * Sword trail: a ribbon of light between where the blade's base and tip were in the last
 * few frames. It is drawn while the blade can hit (and a little before), then fades out.
 *
 * The ribbon lives in a "space" object: the scene for the opponent's sword, the camera
 * for the first-person sword (so walking does not smear it). Only looks.
 */
import * as THREE from 'three';

/** Number of stored blade positions (more = longer ribbon). */
const SAMPLES = 14;
/** Seconds a sample stays visible. */
const LIFE = 0.14;
/** Along the blade (sword-local +Y): where the ribbon starts and ends. */
const BASE_Y = 0.35;
const TIP_Y = 1.35;

interface Sample {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
}

export class SwordTrail {
  readonly mesh: THREE.Mesh;
  private readonly samples: Sample[] = [];
  private readonly positions = new Float32Array(SAMPLES * 2 * 3);
  private readonly colors = new Float32Array(SAMPLES * 2 * 3);
  private readonly color = new THREE.Color();
  private readonly tmp = new THREE.Vector3();

  constructor(color: number) {
    this.color.setHex(color);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const index: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, // black = invisible, so fading the color fades the ribbon
      fog: false,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  setColor(color: number): void {
    this.color.setHex(color);
  }

  /**
   * @param sword the sword group (its local +Y runs along the blade)
   * @param space the object the ribbon mesh is attached to
   * @param emitting true while the swing is fast enough to leave a trail
   * @param dt seconds since the last frame (0 = frozen, e.g. during hitstop)
   */
  update(sword: THREE.Object3D, space: THREE.Object3D, emitting: boolean, dt: number): void {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length > 0 && this.samples[this.samples.length - 1].age > LIFE) this.samples.pop();
    if (emitting && dt > 0) {
      sword.updateWorldMatrix(true, false);
      space.updateWorldMatrix(true, false);
      const toSpace = (y: number) => space.worldToLocal(sword.localToWorld(this.tmp.set(0, y, 0)).clone());
      this.samples.unshift({ base: toSpace(BASE_Y), tip: toSpace(TIP_Y), age: 0 });
      if (this.samples.length > SAMPLES) this.samples.length = SAMPLES;
    }
    this.mesh.visible = this.samples.length >= 2;
    if (!this.mesh.visible) return;
    this.rebuild();
  }

  /** Clear the ribbon at once (e.g. after a respawn). */
  clear(): void {
    this.samples.length = 0;
    this.mesh.visible = false;
  }

  private rebuild(): void {
    const last = this.samples[this.samples.length - 1];
    for (let i = 0; i < SAMPLES; i++) {
      const s = this.samples[i] ?? last; // unused slots collapse onto the oldest sample
      const fade = Math.max(0, 1 - s.age / LIFE) * (1 - i / SAMPLES);
      const o = i * 6;
      s.base.toArray(this.positions, o);
      s.tip.toArray(this.positions, o + 3);
      // The edge near the tip is brighter than the edge near the hand.
      for (const [offset, brightness] of [[o, 0.25], [o + 3, 1]] as const) {
        this.colors[offset] = this.color.r * fade * brightness;
        this.colors[offset + 1] = this.color.g * fade * brightness;
        this.colors[offset + 2] = this.color.b * fade * brightness;
      }
    }
    const geometry = this.mesh.geometry;
    (geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
