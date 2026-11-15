/**
 * Draws the game world with Three.js. It only READS game state - it never changes it.
 * Everything gameplay-relevant happens in src/shared; this file is "just the picture".
 */
import * as THREE from 'three';
import type { MapDef } from '../../shared/maps/mapTypes';
import { rightFromYaw, type Vec3 } from '../../shared/math/vec3';
import { EYE_HEIGHT } from '../../shared/physics/collision';
import type { PlayerState } from '../../shared/sim/playerState';
import { buildMapGroup } from './mapMesh';
import { PlayerAvatar } from './playerAvatar';
import { createScene, type SceneParts } from './sceneSetup';
import { createSword, type SwordModel } from './sword';
import { applySwordPose, swordPose } from './swordPose';

/** Camera tilt while wall-running, in radians. */
const WALL_RUN_ROLL = 0.18;

/** Everything the renderer needs to draw one frame. */
export interface ViewState {
  /** Feet position of the local player, already smoothed for display. */
  localPos: Vec3;
  yaw: number;
  pitch: number;
  /** State of the local player (for the sword animation), or null if not spawned. */
  local: PlayerState | null;
  /** Other players, already interpolated. */
  remotes: PlayerState[];
}

export class GameView {
  private readonly parts: SceneParts;
  private mapGroup: THREE.Group | null = null;
  private readonly avatars = new Map<number, PlayerAvatar>();
  /** First-person sword, attached to the camera. */
  private readonly viewSword: SwordModel = createSword();
  private roll = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.parts = createScene(canvas);
    this.viewSword.group.position.set(0.3, -0.3, -0.5);
    this.viewSword.group.scale.setScalar(0.6);
    this.parts.camera.add(this.viewSword.group);
  }

  /** Replace the displayed map. */
  setMap(map: MapDef): void {
    if (this.mapGroup) this.parts.scene.remove(this.mapGroup);
    this.mapGroup = buildMapGroup(map);
    this.parts.scene.add(this.mapGroup);
  }

  render(state: ViewState): void {
    const { camera, renderer, scene } = this.parts;
    camera.position.set(state.localPos.x, state.localPos.y + EYE_HEIGHT, state.localPos.z);
    this.roll += (this.wallRunRoll(state) - this.roll) * 0.15;
    camera.rotation.set(state.pitch, state.yaw, this.roll);

    this.viewSword.group.visible = state.local?.alive ?? false;
    if (state.local) {
      applySwordPose(this.viewSword.group, this.viewSword.bladeMaterial, swordPose(state.local), 0.35);
    }

    this.updateAvatars(state.remotes);
    renderer.render(scene, camera);
  }

  /** Tilt the camera away from the wall while wall-running. */
  private wallRunRoll(state: ViewState): number {
    const p = state.local;
    if (!p || !p.wallRunning) return 0;
    const right = rightFromYaw(state.yaw);
    const wallIsOnTheRight = p.wallNormalX * right.x + p.wallNormalZ * right.z < 0;
    return wallIsOnTheRight ? WALL_RUN_ROLL : -WALL_RUN_ROLL;
  }

  /** Create, update and remove avatars so they match the list of remote players. */
  private updateAvatars(remotes: PlayerState[]): void {
    for (const player of remotes) {
      let avatar = this.avatars.get(player.slot);
      if (!avatar) {
        avatar = new PlayerAvatar();
        this.avatars.set(player.slot, avatar);
        this.parts.scene.add(avatar.group);
      }
      avatar.update(player);
    }
    for (const [slot, avatar] of this.avatars) {
      if (remotes.some((p) => p.slot === slot)) continue;
      this.parts.scene.remove(avatar.group);
      this.avatars.delete(slot);
    }
  }
}
