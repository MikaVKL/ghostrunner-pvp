/**
 * Builds the visible 3D objects for a map. Every map box becomes one colored box with a
 * 1-meter grid pattern, so speed and distances are easy to judge.
 */
import * as THREE from 'three';
import type { Box, MapDef } from '../../shared/maps/mapTypes';

/** A white tile with a dark border; tinted by each box's color. One tile = 1 meter. */
function createGridTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#9aa3ad';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
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

function createBoxMesh(box: Box, texture: THREE.Texture): THREE.Mesh {
  const size = new THREE.Vector3(
    box.max.x - box.min.x,
    box.max.y - box.min.y,
    box.max.z - box.min.z,
  );
  const center = new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    (box.min.y + box.max.y) / 2,
    (box.min.z + box.max.z) / 2,
  );
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  applyWorldUvs(geometry, center);
  const material = new THREE.MeshStandardMaterial({ color: box.color, map: texture, roughness: 0.9 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(center);
  return mesh;
}

export function buildMapGroup(map: MapDef): THREE.Group {
  const group = new THREE.Group();
  const texture = createGridTexture();
  for (const box of map.boxes) group.add(createBoxMesh(box, texture));
  return group;
}
