/**
 * Creates the Three.js renderer, scene, camera, lights, fog and the sky backdrop.
 */
import * as THREE from 'three';
import type { MapTheme } from '../../shared/maps/mapTypes';
import { SKY_COLORS } from './palette';
import { createSky, type Sky } from './sky';

/** Field of view in degrees while standing still (camera effects widen it at speed). */
export const BASE_FOV = 82;

export interface SceneParts {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** The backdrop; its group follows the camera (see sky.ts). */
  sky: Sky;
  /** Recolor sky and fog for a map (see MapDef.theme). */
  setTheme: (theme: MapTheme) => void;
}

/** Used for maps without their own theme. */
export const DEFAULT_THEME: MapTheme = {
  skyTop: SKY_COLORS.top,
  skyMiddle: SKY_COLORS.middle,
  skyHorizon: SKY_COLORS.horizon,
  fog: SKY_COLORS.fog,
};

export function createScene(canvas: HTMLCanvasElement): SceneParts {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLORS.fog);
  scene.fog = new THREE.Fog(SKY_COLORS.fog, 28, 130);

  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 700);
  // 'YXZ' = first turn left/right (yaw), then look up/down (pitch), then tilt (roll).
  camera.rotation.order = 'YXZ';
  scene.add(camera); // needed so objects attached to the camera (the sword) are drawn

  const sky = createSky();
  scene.add(sky.group);
  const fog = scene.fog;
  const setTheme = (theme: MapTheme) => {
    sky.setTheme(theme);
    fog.color.setHex(theme.fog);
    (scene.background as THREE.Color).setHex(theme.fog);
  };

  // Cool light from above, warm pink light from the horizon side, a bit of fill.
  scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x2a1838, 1.5));
  const moonLight = new THREE.DirectionalLight(0xffc4e0, 1.3);
  moonLight.position.set(-9, 14, -20);
  scene.add(moonLight);
  const fill = new THREE.DirectionalLight(0x4fd8ff, 0.5);
  fill.position.set(10, 6, 12);
  scene.add(fill);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, sky, setTheme };
}
