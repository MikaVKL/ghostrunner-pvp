/**
 * The backdrop: a night-sky gradient, stars, a moon and a far-away skyline with neon
 * stripes. Everything is generated in code - no image files.
 * The whole group follows the camera, so it always looks infinitely far away.
 */
import * as THREE from 'three';
import type { MapTheme } from '../../shared/maps/mapTypes';
import { createRng } from '../../shared/math/rng';
import { SKY_COLORS, TEAM_COLORS } from './palette';

const DOME_RADIUS = 300;

/** A huge sphere seen from inside; a tiny shader paints the gradient. */
function createDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_COLORS.top) },
      middle: { value: new THREE.Color(SKY_COLORS.middle) },
      horizon: { value: new THREE.Color(SKY_COLORS.horizon) },
      below: { value: new THREE.Color(SKY_COLORS.fog) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 middle; uniform vec3 horizon; uniform vec3 below;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 color = mix(horizon, middle, smoothstep(0.0, 0.22, h));
        color = mix(color, top, smoothstep(0.18, 0.75, h));
        color = mix(color, below, smoothstep(0.0, -0.12, h));
        gl_FragColor = vec4(color, 1.0);
      }`,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), material);
}

function createStars(rng: () => number): THREE.Points {
  const count = 450;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const height = 0.12 + rng() * 0.88; // only above the horizon
    const flat = Math.sqrt(1 - height * height);
    positions.set([Math.cos(angle) * flat, height, Math.sin(angle) * flat].map((v) => v * (DOME_RADIUS - 10)), i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xcfd8ff, size: 1.6, sizeAttenuation: false, fog: false });
  return new THREE.Points(geometry, material);
}

/** Dark towers on the horizon, each with a few glowing stripes. */
function createSkyline(rng: () => number): THREE.Group {
  const group = new THREE.Group();
  const count = 70;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const towers = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ color: SKY_COLORS.buildings, fog: false }), count);
  const stripes = new THREE.InstancedMesh(box, new THREE.MeshBasicMaterial({ fog: false }), count * 2);
  const matrix = new THREE.Matrix4();
  const color = new THREE.Color();
  const stripeColors = [...TEAM_COLORS, 0xf0a020, 0x6a3fd0];

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.05;
    const distance = 120 + rng() * 70;
    const width = 8 + rng() * 14;
    const height = 40 + rng() * 110;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    const baseY = -70;
    matrix.makeScale(width, height, width).setPosition(x, baseY + height / 2, z);
    towers.setMatrixAt(i, matrix);
    for (let s = 0; s < 2; s++) {
      const y = baseY + height * (0.55 + rng() * 0.42);
      matrix.makeScale(width + 0.4, 0.5 + rng(), width + 0.4).setPosition(x, y, z);
      stripes.setMatrixAt(i * 2 + s, matrix);
      color.setHex(stripeColors[Math.floor(rng() * stripeColors.length)]).multiplyScalar(0.55);
      stripes.setColorAt(i * 2 + s, color);
    }
  }
  group.add(towers, stripes);
  return group;
}

function createMoon(): THREE.Mesh {
  const moon = new THREE.Mesh(
    new THREE.CircleGeometry(16, 40),
    new THREE.MeshBasicMaterial({ color: SKY_COLORS.moon, fog: false }),
  );
  moon.position.set(-90, 95, -230);
  moon.lookAt(0, 0, 0);
  return moon;
}

export interface Sky {
  /** Move this to the camera position every frame. */
  group: THREE.Group;
  /** Recolor the sky for a map (see MapDef.theme). */
  setTheme: (theme: MapTheme) => void;
}

/** Build the whole backdrop. */
export function createSky(): Sky {
  const rng = createRng(2077); // fixed seed: the skyline looks the same every time
  const group = new THREE.Group();
  const dome = createDome();
  group.add(dome, createStars(rng), createMoon(), createSkyline(rng));
  group.renderOrder = -1;
  const uniforms = (dome.material as THREE.ShaderMaterial).uniforms;
  const setTheme = (theme: MapTheme) => {
    (uniforms.top.value as THREE.Color).setHex(theme.skyTop);
    (uniforms.middle.value as THREE.Color).setHex(theme.skyMiddle);
    (uniforms.horizon.value as THREE.Color).setHex(theme.skyHorizon);
    (uniforms.below.value as THREE.Color).setHex(theme.fog);
  };
  return { group, setTheme };
}
