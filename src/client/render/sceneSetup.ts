/**
 * Creates the Three.js renderer, scene, camera and lights.
 */
import * as THREE from 'three';

const SKY_COLOR = 0x9db8d9;

export interface SceneParts {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export function createScene(canvas: HTMLCanvasElement): SceneParts {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_COLOR);
  scene.fog = new THREE.Fog(SKY_COLOR, 40, 140);

  const camera = new THREE.PerspectiveCamera(80, 1, 0.05, 300);
  // 'YXZ' = first turn left/right (yaw), then look up/down (pitch), then tilt (roll).
  camera.rotation.order = 'YXZ';
  scene.add(camera); // needed so objects attached to the camera (the sword) are drawn

  scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(12, 25, 8);
  scene.add(sun);

  const resize = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera };
}
