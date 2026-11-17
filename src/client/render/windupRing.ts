/**
 * Wind-up cue: a red ring around a fighter while its swing winds up (the startup phase,
 * before the blade can hit). It closes in and gets brighter as the hit comes nearer -
 * the moment to parry or dodge. Display only; on/off is a player setting (settings.ts).
 */
import * as THREE from 'three';
import { currentAttack } from '../../shared/combat/actions';
import type { PlayerState } from '../../shared/sim/playerState';
import { FX_COLORS } from './palette';

/** Ring size at the start of the wind-up and right before the blade becomes dangerous. */
const START_SCALE = 1.7;
const END_SCALE = 0.85;
const CHEST_HEIGHT = 1.1;

/** 0 = the swing just started, towards 1 = about to hit; null = not winding up. */
export function windupProgress(p: PlayerState): number | null {
  if (!p.alive || p.action !== 'attack') return null;
  const startup = currentAttack(p).startupTicks;
  if (startup <= 0 || p.actionTicks >= startup) return null;
  return p.actionTicks / startup;
}

export class WindupRing {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: FX_COLORS.windup,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 48), this.material);
    this.mesh.rotation.x = Math.PI / 2; // lying flat around the body
    this.mesh.position.y = CHEST_HEIGHT;
    this.mesh.visible = false;
  }

  update(player: PlayerState, enabled: boolean): void {
    const progress = enabled ? windupProgress(player) : null;
    this.mesh.visible = progress !== null;
    if (progress === null) return;
    this.mesh.scale.setScalar(START_SCALE + (END_SCALE - START_SCALE) * progress);
    this.material.opacity = 0.45 + 0.55 * progress;
  }
}
