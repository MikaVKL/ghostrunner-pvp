/**
 * A very simple sword model: a handle and a blade made of boxes.
 */
import * as THREE from 'three';

export interface SwordModel {
  /** Rotate this to swing the sword. Its origin is at the handle. */
  group: THREE.Group;
  /** Change this material's color to tint the blade. */
  bladeMaterial: THREE.MeshStandardMaterial;
}

export function createSword(): SwordModel {
  const group = new THREE.Group();
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.1, roughness: 0.35 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.02), bladeMaterial);
  blade.position.y = 0.65;
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.22, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x2d3748 }),
  );
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.04, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x718096 }),
  );
  guard.position.y = 0.11;
  group.add(blade, handle, guard);
  return { group, bladeMaterial };
}
