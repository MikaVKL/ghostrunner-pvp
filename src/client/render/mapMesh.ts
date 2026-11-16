/**
 * Builds the visible 3D objects for a map. Every map box becomes one dark box with a
 * 1-meter grid pattern (so speed and distances are easy to judge) and glowing neon
 * edges in the box's color. Below the map, layers of mist hide the bottom of the abyss.
 */
import * as THREE from 'three';
import type { Box, JumpPad, MapDef } from '../../shared/maps/mapTypes';
import { FX_COLORS, SKY_COLORS } from './palette';

/** A dark tile with a light border; tinted by each box's color. One tile = 1 meter. */
function createGridTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8c8c8c';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Set texture coordinates from world positions so the grid has the same size everywhere. */
function applyWorldUvs(geometry: THREE.BufferGeometry, center: THREE.Vector3): void {
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + center.x;
    const y = pos.getY(i) + center.y;
    const z = pos.getZ(i) + center.z;
    if (Math.abs(normal.getX(i)) > 0.5) uv.setXY(i, z, y);
    else if (Math.abs(normal.getY(i)) > 0.5) uv.setXY(i, x, z);
    else uv.setXY(i, x, y);
  }
  uv.needsUpdate = true;
}

function createBoxObject(box: Box, texture: THREE.Texture): THREE.Object3D {
  const size = new THREE.Vector3(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const center = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2,
  );
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  applyWorldUvs(geometry, center);
  const color = new THREE.Color(box.color);
  const material = new THREE.MeshStandardMaterial({
    color,
    map: texture,
    roughness: 0.75,
    metalness: 0.15,
    emissive: color.clone().multiplyScalar(0.18), // bright boxes glow a little
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(center);

  // Neon outline: the same color, pushed toward white.
  const edgeColor = color.clone().lerp(new THREE.Color(0xffffff), 0.35);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edgeColor }),
  );
  mesh.add(edges);
  return mesh;
}

/** Semi-transparent layers below the floors: the deeper you look, the less you see. */
function createAbyssMist(map: MapDef): THREE.Group {
  const mist = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(600, 600);
  for (let i = 0; i < 5; i++) {
    const material = new THREE.MeshBasicMaterial({
      color: SKY_COLORS.fog,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      fog: false,
    });
    const layer = new THREE.Mesh(geometry, material);
    layer.rotation.x = -Math.PI / 2;
    layer.position.y = -3 + (map.killY * (i + 1)) / 5;
    mist.add(layer);
  }
  return mist;
}

/**
 * A jump pad: a glowing plate on the floor with an arrow that points where it throws you.
 */
function createPadObject(pad: JumpPad): THREE.Object3D {
  const group = new THREE.Group();
  const sizeX = pad.max.x - pad.min.x;
  const sizeZ = pad.max.z - pad.min.z;
  const glow = new THREE.MeshBasicMaterial({ color: FX_COLORS.pad, transparent: true, opacity: 0.55, fog: false });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(sizeX, 0.06, sizeZ), glow);
  plate.position.y = 0.03;
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(sizeX, 0.12, sizeZ)),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  frame.position.y = 0.06;
  // The arrow: a flat triangle lying on the plate. Pads that throw straight up show a square instead.
  const flat = Math.hypot(pad.launch.x, pad.launch.z);
  const marker =
    flat > 0.1
      ? new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }))
      : new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.7), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
  if (flat > 0.1) {
    marker.rotation.x = Math.PI / 2; // lay the cone down, tip toward -Z
    marker.scale.z = 0.08; // flatten it into an arrow head
    const arrow = new THREE.Group();
    arrow.add(marker);
    arrow.rotation.y = Math.atan2(-pad.launch.x, -pad.launch.z); // same convention as a player's yaw
    arrow.rotation.order = 'YXZ';
    arrow.position.y = 0.1;
    group.add(arrow);
  } else {
    marker.position.y = 0.1;
    group.add(marker);
  }
  group.add(plate, frame);
  group.position.set((pad.min.x + pad.max.x) / 2, pad.min.y, (pad.min.z + pad.max.z) / 2);
  return group;
}

export function buildMapGroup(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  const texture = createGridTexture();
  for (const box of map.boxes) group.add(createBoxObject(box, texture));
  for (const pad of map.pads ?? []) group.add(createPadObject(pad));
  group.add(createAbyssMist(map));
  return group;
}
