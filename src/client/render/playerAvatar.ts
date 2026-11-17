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
import { WindupRing, windupProgress } from './windupRing';

/** Leg swing per meter run, in radians. */
const STRIDE_PER_METER = 2.6;

export class PlayerAvatar {
  readonly group: THREE.Group;
  private readonly model: FighterModel;
  private readonly anim: FighterAnim = { runPhase: 0, time: 0 };
  private readonly baseColor: THREE.Color;
  private readonly windupRing = new WindupRing();

  constructor(slot: number) {
    this.model = createFighter(teamColor(slot));
    this.group = this.model.root;
    this.baseColor = new THREE.Color(teamColor(slot));
    this.group.add(this.windupRing.mesh);
  }

  /**
   * @param dt seconds since the last frame
   * @param windupCue show the wind-up cue (red ring + red blade while the swing winds up)
   */
  update(player: PlayerState, dt: number, windupCue: boolean): void {
    this.group.visible = player.alive;
    this.group.position.set(player.pos.x, player.pos.y, player.pos.z);
    this.group.rotation.y = player.yaw;

    this.anim.time += dt;
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (player.grounded || player.wallRunning) this.anim.runPhase += speed * dt * STRIDE_PER_METER;
    poseFighter(this.model, player, this.anim);
    this.windupRing.update(player, windupCue);

    // The glow shows the state: yellow = stunned (free hit!), white-blue = parrying,
    // flickering white = invulnerable after a hit (arena).
    const glow = this.model.glow;
    const flicker = player.invulnerableTicks > 0 && Math.floor(this.anim.time * 12) % 2 === 0;
    if (flicker) glow.emissive.setHex(FX_COLORS.invulnerable);
    else if (player.action === 'stunned') glow.emissive.setHex(FX_COLORS.stun);
    else if (isParryActive(player)) glow.emissive.setHex(FX_COLORS.parry);
    else glow.emissive.copy(this.baseColor);
    const blade = this.model.sword.bladeMaterial.emissive;
    if (windupCue && windupProgress(player) !== null) blade.setHex(FX_COLORS.windup);
    else blade.copy(glow.emissive);
  }
}
