/**
 * Draws the game world with Three.js. It only READS game state - it never changes it.
 * Everything gameplay-relevant happens in src/shared; this file is "just the picture".
 */
import * as THREE from 'three';
import { isParryActive } from '../../shared/combat/actions';
import type { MapDef } from '../../shared/maps/mapTypes';
import type { Vec3 } from '../../shared/math/vec3';
import { EYE_HEIGHT } from '../../shared/physics/collision';
import type { PlayerState } from '../../shared/sim/playerState';
import { CameraFx } from './cameraFx';
import { buildMapGroup } from './mapMesh';
import { FX_COLORS, teamColor } from './palette';
import { Particles } from './particles';
import { PlayerAvatar } from './playerAvatar';
import { createScene, type SceneParts } from './sceneSetup';
import { SlashArc } from './slashArc';
import { createSword, type SwordModel } from './sword';
import { applySwordPose, swordPose } from './swordPose';

/** Size of the first-person sword compared to the swords of the figures. */
const VIEW_SWORD_SCALE = 0.6;

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
  /** Seconds since the last frame. */
  dt: number;
}

export class GameView {
  readonly particles = new Particles();
  readonly cameraFx = new CameraFx();
  private readonly parts: SceneParts;
  private mapGroup: THREE.Group | null = null;
  private readonly avatars = new Map<number, PlayerAvatar>();
  private readonly arcs = new Map<number, SlashArc>();
  /** First-person sword, attached to the camera. */
  private viewSword: SwordModel = createSword(teamColor(0));
  private viewSwordSlot = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.parts = createScene(canvas);
    this.viewSword.group.scale.setScalar(VIEW_SWORD_SCALE);
    this.parts.camera.add(this.viewSword.group);
    this.parts.scene.add(this.particles.points);
  }

  /** Replace the displayed map. */
  setMap(map: MapDef): void {
    if (this.mapGroup) this.parts.scene.remove(this.mapGroup);
    this.mapGroup = buildMapGroup(map);
    this.parts.scene.add(this.mapGroup);
  }

  render(state: ViewState): void {
    const { camera, renderer, scene, sky } = this.parts;
    const fx = this.cameraFx.update(state.local, state.yaw, state.dt);
    camera.position.set(state.localPos.x + fx.x, state.localPos.y + EYE_HEIGHT + fx.y, state.localPos.z + fx.z);
    camera.rotation.set(state.pitch + fx.pitch, state.yaw, fx.roll);
    if (Math.abs(camera.fov - fx.fov) > 0.01) {
      camera.fov = fx.fov;
      camera.updateProjectionMatrix();
    }
    sky.position.copy(camera.position);

    this.updateViewSword(state.local, state.dt);
    this.updateAvatars(state.remotes, state.dt);
    this.updateArcs(state.local ? [state.local, ...state.remotes] : state.remotes);
    this.particles.update(state.dt);
    renderer.render(scene, camera);
  }

  private updateViewSword(local: PlayerState | null, dt: number): void {
    if (local && local.slot !== this.viewSwordSlot) {
      // Our slot (and so our color) changed: build a sword in the right color.
      this.parts.camera.remove(this.viewSword.group);
      this.viewSword = createSword(teamColor(local.slot));
      this.viewSword.group.scale.setScalar(VIEW_SWORD_SCALE);
      this.viewSwordSlot = local.slot;
      this.parts.camera.add(this.viewSword.group);
    }
    this.viewSword.group.visible = local?.alive ?? false;
    if (!local) return;
    applySwordPose(this.viewSword.group, swordPose(local), 1 - Math.exp(-28 * dt));
    const emissive = this.viewSword.bladeMaterial.emissive;
    if (local.action === 'stunned') emissive.setHex(FX_COLORS.stun);
    else if (isParryActive(local)) emissive.setHex(FX_COLORS.parry);
    else emissive.setHex(teamColor(local.slot));
  }

  /** Create, update and remove avatars so they match the list of remote players. */
  private updateAvatars(remotes: PlayerState[], dt: number): void {
    for (const player of remotes) {
      let avatar = this.avatars.get(player.slot);
      if (!avatar) {
        avatar = new PlayerAvatar(player.slot);
        this.avatars.set(player.slot, avatar);
        this.parts.scene.add(avatar.group);
      }
      avatar.update(player, dt);
    }
    for (const [slot, avatar] of this.avatars) {
      if (remotes.some((p) => p.slot === slot)) continue;
      this.parts.scene.remove(avatar.group);
      this.avatars.delete(slot);
    }
  }

  /** One glowing swing arc per player (also for the local player). */
  private updateArcs(players: PlayerState[]): void {
    for (const player of players) {
      let arc = this.arcs.get(player.slot);
      if (!arc) {
        arc = new SlashArc(player.slot);
        this.arcs.set(player.slot, arc);
        this.parts.scene.add(arc.mesh);
      }
      arc.update(player);
    }
    for (const [slot, arc] of this.arcs) {
      if (!players.some((p) => p.slot === slot)) arc.mesh.visible = false;
    }
  }
}
