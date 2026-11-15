/**
 * The visible body of another player: a capsule with a visor (shows where it looks)
 * and a sword. Placeholder art - swap in a real model later.
 */
import * as THREE from 'three';
import { PLAYER_HALF_WIDTH, PLAYER_HEIGHT } from '../../shared/physics/collision';
import type { PlayerState } from '../../shared/sim/playerState';
import { createSword, type SwordModel } from './sword';
import { applySwordPose, swordPose } from './swordPose';

const BODY_COLOR = 0xe53e3e;
const STUNNED_COLOR = 0xf2c744;

export class PlayerAvatar {
  readonly group = new THREE.Group();
  private readonly bodyMaterial = new THREE.MeshStandardMaterial({ color: BODY_COLOR, roughness: 0.6 });
  private readonly sword: SwordModel = createSword();

  constructor() {
    const radius = PLAYER_HALF_WIDTH;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(radius, PLAYER_HEIGHT - radius * 2, 6, 14),
      this.bodyMaterial,
    );
    body.position.y = PLAYER_HEIGHT / 2;

    // The visor sits on the front side (-Z is forward).
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.16, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x1a202c }),
    );
    visor.position.set(0, PLAYER_HEIGHT - 0.3, -radius + 0.05);

    this.sword.group.position.set(0.45, 1.05, -0.25);
    this.group.add(body, visor, this.sword.group);
  }

  update(player: PlayerState): void {
    this.group.visible = player.alive;
    this.group.position.set(player.pos.x, player.pos.y, player.pos.z);
    this.group.rotation.y = player.yaw;
    this.bodyMaterial.color.setHex(player.action === 'stunned' ? STUNNED_COLOR : BODY_COLOR);
    applySwordPose(this.sword.group, this.sword.bladeMaterial, swordPose(player), 0.5);
  }
}
