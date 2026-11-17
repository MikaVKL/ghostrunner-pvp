/**
 * The goal of a time trial: a glowing beam of light with a ring on the ground, visible
 * from far away. Only looks - whether the goal is reached decides solo/timeTrial.ts.
 */
import * as THREE from 'three';
import type { Vec3 } from '../../shared/math/vec3';
import { GOAL_RADIUS } from '../../solo/timeTrial';
import { FX_COLORS } from './palette';

export function createGoalMarker(pos: Vec3): THREE.Object3D {
  const group = new THREE.Group();
  const glow = (opacity: number) =>
    new THREE.MeshBasicMaterial({ color: FX_COLORS.pad, transparent: true, opacity, depthWrite: false, fog: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 40, 16, 1, true), glow(0.18));
  beam.position.y = 20;
  const ring = new THREE.Mesh(new THREE.RingGeometry(GOAL_RADIUS - 0.25, GOAL_RADIUS, 48), glow(0.7));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(beam, ring);
  group.position.set(pos.x, pos.y, pos.z);
  return group;
}
