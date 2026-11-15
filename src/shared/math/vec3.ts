/**
 * Minimal 3D vector helpers on plain objects.
 *
 * We use plain `{x, y, z}` objects (not THREE.Vector3) in all shared code so the
 * simulation runs on the server without Three.js and serializes to JSON as-is.
 *
 * Coordinate system (same as Three.js): +X right, +Y up, -Z is "forward" at yaw 0.
 */
import { lerp } from './scalar';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function vec3(x = 0, y = 0, z = 0): Vec3 {
  return { x, y, z };
}

export function cloneVec3(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Distance ignoring height (Y). */
export function horizontalDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Horizontal forward direction for a yaw angle. Yaw 0 looks along -Z. */
export function forwardFromYaw(yaw: number): { x: number; z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** Horizontal right direction for a yaw angle. */
export function rightFromYaw(yaw: number): { x: number; z: number } {
  return { x: Math.cos(yaw), z: -Math.sin(yaw) };
}

/** Yaw angle that looks from `from` toward `to` (ignores height). */
export function yawToward(from: Vec3, to: Vec3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}
