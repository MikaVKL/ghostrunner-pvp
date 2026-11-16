/**
 * Builds the visible 3D objects for a map. Every map box becomes one dark box with a
 * 1-meter grid pattern (so speed and distances are easy to judge) and glowing neon
 * edges in the box's color. Below the map, layers of mist hide the bottom of the abyss.
 */
import * as THREE from 'three';
import type { Box, MapDef } from '../../shared/maps/mapTypes';
import { SKY_COLORS } from './palette';

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

export function buildMapGroup(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  const texture = createGridTexture();
  for (const box of map.boxes) group.add(createBoxObject(box, texture));
  group.add(createAbyssMist(map));
  return group;
}
