/**
 * The visible body of another player: a FighterModel that follows the (interpolated)
 * PlayerState and is animated by fighterPose.ts.
 */
import * as THREE from 'three';
import type { PlayerState } from '../../shared/sim/playerState';
import { isParryActive } from '../../shared/combat/actions';
import { createFighter, type FighterModel } from './fighterModel';
import { poseFighter, type FighterAnim } from './fighterPose';
import { FX_COLORS, teamColor } from './palette';

/** Leg swing per meter run, in radians. */
const STRIDE_PER_METER = 2.6;

export class PlayerAvatar {
  readonly group: THREE.Group;
  private readonly model: FighterModel;
  private readonly anim: FighterAnim = { runPhase: 0, time: 0 };
  private readonly baseColor: THREE.Color;

  constructor(slot: number) {
    this.model = createFighter(teamColor(slot));
    this.group = this.model.root;
    this.baseColor = new THREE.Color(teamColor(slot));
  }

  /** @param dt seconds since the last frame */
  update(player: PlayerState, dt: number): void {
    this.group.visible = player.alive;
    this.group.position.set(player.pos.x, player.pos.y, player.pos.z);
    this.group.rotation.y = player.yaw;

    this.anim.time += dt;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (player.grounded || player.wallRunning) this.anim.runPhase += speed * dt * STRIDE_PER_METER;
    poseFighter(this.model, player, this.anim);

    // The glow shows the state: yellow = stunned (free hit!), white-blue = parrying.
    const glow = this.model.glow;
    if (player.action === 'stunned') glow.emissive.setHex(FX_COLORS.stun);
    else if (isParryActive(player)) glow.emissive.setHex(FX_COLORS.parry);
    else glow.emissive.copy(this.baseColor);
    this.model.sword.bladeMaterial.emissive.copy(glow.emissive);
  }
}
