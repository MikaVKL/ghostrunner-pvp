/**
 * Post-processing: makes bright things (blades, neon edges, sparks) glow ("bloom").
 *
 * Without bloom the scene is drawn straight to the screen. With bloom it is drawn into an
 * off-screen picture first, the bright parts are blurred and added back on top
 * (UnrealBloomPass from the Three.js examples). Only looks; can be switched off in the menu.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** How strong the glow is, how far it spreads, and how bright a pixel must be to glow. */
const BLOOM_STRENGTH = 0.85;
const BLOOM_RADIUS = 0.45;
const BLOOM_THRESHOLD = 0.62;

export class PostFx {
  /** Switched by the settings (Settings.bloom). */
  bloom = true;
  private composer: EffectComposer | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    window.addEventListener('resize', () => this.resize());
  }

  render(): void {
    if (!this.bloom) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer ??= this.createComposer();
    this.composer.render();
  }

  /** Built on first use, so players who switch bloom off never pay for it. */
  private createComposer(): EffectComposer {
    const size = this.renderer.getSize(new THREE.Vector2());
    // 4x multisampling: without it the off-screen picture would have jagged edges.
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(new UnrealBloomPass(size, BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD));
    composer.addPass(new OutputPass()); // color space conversion for the screen
    composer.setPixelRatio(this.renderer.getPixelRatio());
    composer.setSize(size.x, size.y);
    return composer;
  }

  private resize(): void {
    if (!this.composer) return;
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer.setSize(size.x, size.y);
  }
}
