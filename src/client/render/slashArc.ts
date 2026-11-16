/**
 * The glowing arc of a sword swing. It is drawn flat in front of the attacker and has
 * exactly the reach and width of the attack - what you see is what can hit.
 * Used for the local player and for the opponent.
 */
import * as THREE from 'three';
import { currentAttack } from '../../shared/combat/actions';
import type { AttackProfile } from '../../shared/combat/weapons';
import { PLAYER_HALF_WIDTH } from '../../shared/physics/collision';
import type { PlayerState } from '../../shared/sim/playerState';
import { teamColor } from './palette';

/** Height of the arc above the feet. */
const ARC_HEIGHT = 1.15;
/** How long the arc keeps glowing after the active phase, in ticks. */
const FADE_TICKS = 8;

export class SlashArc {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;
  /** The attack profile the current geometry was built for. */
  private builtFor: AttackProfile | null = null;

  constructor(slot: number) {
    this.material = new THREE.MeshBasicMaterial({
      color: teamColor(slot),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.visible = false;
  }

  /** A flat ring segment: from 0.5 m to the reach of the attack, as wide as its hit cone. */
  private build(attack: AttackProfile): void {
    const arc = (attack.arcDegrees * Math.PI) / 180;
    const geometry = new THREE.RingGeometry(0.5, attack.range + PLAYER_HALF_WIDTH, 24, 1, Math.PI / 2 - arc / 2, arc);
    geometry.rotateX(-Math.PI / 2); // lay it flat: the ring's "up" becomes "forward" (-Z)
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.builtFor = attack;
  }

  update(p: PlayerState): void {
    const opacity = p.alive && p.action === 'attack' ? this.opacityFor(p) : 0;
    this.mesh.visible = opacity > 0.01;
    if (!this.mesh.visible) return;
    const attack = currentAttack(p);
    if (this.builtFor !== attack) this.build(attack);
    this.material.opacity = opacity;
    this.mesh.position.set(p.pos.x, p.pos.y + ARC_HEIGHT, p.pos.z);
    this.mesh.rotation.y = p.yaw;
  }

  private opacityFor(p: PlayerState): number {
    const attack = currentAttack(p);
    const sinceActive = p.actionTicks - attack.startupTicks;
    if (sinceActive < 0) return 0;
    if (sinceActive < attack.activeTicks) return 0.75;
    return Math.max(0, 0.75 * (1 - (sinceActive - attack.activeTicks) / FADE_TICKS));
  }
}
