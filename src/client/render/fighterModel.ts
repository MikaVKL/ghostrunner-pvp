/**
 * A simple fighter figure built from boxes: body, head with a glowing visor, two arms,
 * two legs and a sword in the right hand. No model files needed.
 *
 * The limbs are separate groups with their pivot at the joint (shoulder / hip), so
 * fighterPose.ts can animate them by setting rotations.
 * Coordinates: feet at the origin, the figure looks toward -Z, height 1.8 m.
 */
import * as THREE from 'three';
import { createSword, type SwordModel } from './sword';

export interface FighterModel {
  /** Put this into the scene. Position = feet, rotation.y = yaw. */
  root: THREE.Group;
  /** Upper and lower body together, pivot at the hips. Lean and twist this. */
  body: THREE.Group;
  head: THREE.Group;
  armLeft: THREE.Group;
  armRight: THREE.Group;
  legLeft: THREE.Group;
  legRight: THREE.Group;
  sword: SwordModel;
  /** The glowing parts (visor, chest light, stripes). */
  glow: THREE.MeshStandardMaterial;
  armor: THREE.MeshStandardMaterial;
}

const HIP_HEIGHT = 0.9;

function box(w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** A limb hanging down from its pivot (the returned group). */
function limb(length: number, thickness: number, armor: THREE.Material, glow: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.add(box(thickness, length, thickness, armor, 0, -length / 2, 0));
  group.add(box(thickness + 0.02, 0.05, thickness + 0.02, glow, 0, -length * 0.55, 0)); // glowing band
  return group;
}

export function createFighter(glowColor: number): FighterModel {
  const armor = new THREE.MeshStandardMaterial({ color: 0x4a5680, roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x252b45, roughness: 0.7 });
  const glow = new THREE.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 1.2 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = HIP_HEIGHT;
  root.add(body);

  // Torso (the front is -Z).
  body.add(box(0.46, 0.56, 0.26, armor, 0, 0.3, 0));
  body.add(box(0.38, 0.2, 0.24, dark, 0, 0.02, 0)); // waist
  body.add(box(0.26, 0.05, 0.02, glow, 0, 0.42, -0.14)); // chest light
  body.add(box(0.05, 0.4, 0.02, glow, 0, 0.3, 0.14)); // spine light
  body.add(box(0.17, 0.09, 0.22, armor, -0.31, 0.56, 0)); // shoulder pads
  body.add(box(0.17, 0.09, 0.22, armor, 0.31, 0.56, 0));

  const head = new THREE.Group();
  head.position.y = 0.74;
  head.add(box(0.25, 0.27, 0.27, armor));
  head.add(box(0.26, 0.07, 0.05, glow, 0, 0.02, -0.125)); // visor
  body.add(head);

  const armLeft = limb(0.56, 0.11, armor, glow);
  armLeft.position.set(-0.31, 0.5, 0);
  const armRight = limb(0.56, 0.11, armor, glow);
  armRight.position.set(0.31, 0.5, 0);
  body.add(armLeft, armRight);

  // The sword sits in the right hand. With the arm hanging down, the blade points forward.
  const sword = createSword(glowColor);
  sword.group.position.set(0, -0.56, -0.02);
  sword.group.rotation.x = -Math.PI / 2;
  armRight.add(sword.group);

  const legLeft = limb(HIP_HEIGHT, 0.15, dark, glow);
  legLeft.position.set(-0.13, 0, 0);
  const legRight = limb(HIP_HEIGHT, 0.15, dark, glow);
  legRight.position.set(0.13, 0, 0);
  body.add(legLeft, legRight);

  return { root, body, head, armLeft, armRight, legLeft, legRight, sword, glow, armor };
}
