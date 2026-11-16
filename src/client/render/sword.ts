/**
 * The sword: a handle, a guard and a glowing blade, made of boxes.
 */
import * as THREE from 'three';

export interface SwordModel {
  /** Rotate this to swing the sword. Its origin is at the handle, the blade points up (+Y). */
  group: THREE.Group;
  /** Change this material's emissive color to tint the blade. */
  bladeMaterial: THREE.MeshStandardMaterial;
}

export function createSword(glowColor: number): SwordModel {
  const group = new THREE.Group();
  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8f4ff,
    emissive: glowColor,
    emissiveIntensity: 0.9,
    metalness: 0.4,
    roughness: 0.25,
  });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.15, 0.016), bladeMaterial);
  blade.position.y = 0.68;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), bladeMaterial);
  tip.position.y = 1.31;
  tip.scale.z = 0.4;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028, 0.028, 0.26, 8),
    new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: 0.6 }),
  );
  const guard = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.035, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x8a93b8, metalness: 0.7, roughness: 0.3 }),
  );
  guard.position.y = 0.13;
  group.add(blade, tip, handle, guard);
  return { group, bladeMaterial };
}
