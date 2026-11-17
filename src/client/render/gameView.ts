/**
 * Draws the game world with Three.js. It only READS game state - it never changes it.
 * Everything gameplay-relevant happens in src/shared; this file is "just the picture".
 */
import * as THREE from 'three';
import { isParryActive } from '../../shared/combat/actions';
import type { MapDef } from '../../shared/maps/mapTypes';
import type { Vec3 } from '../../shared/math/vec3';
import { CROUCH_EYE_HEIGHT, EYE_HEIGHT } from '../../shared/physics/collision';
import type { PlayerState } from '../../shared/sim/playerState';
import { bladeGlow, trailEmitting } from './bladeGlow';
import { CameraFx } from './cameraFx';
import { buildMapGroup } from './mapMesh';
import { FX_COLORS, teamColor } from './palette';
import { Particles } from './particles';
import { PlayerAvatar } from './playerAvatar';
import { PostFx } from './postFx';
import { createScene, DEFAULT_THEME, type SceneParts } from './sceneSetup';
import { SlashArc } from './slashArc';
import { SpeedLines } from './speedLines';
import { SwordTrail } from './swordTrail';
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
  /** Seconds since the last frame (camera effects). */
  dt: number;
  /** Seconds the picture moves this frame: 0 while frozen by hitstop (fighters, particles, sword). */
  animDt: number;
  /** Show the wind-up cue on the other players (setting + game mode, see settings.ts). */
  windupCue: boolean;
  /** Look-and-feel settings (see app/settings.ts). */
  fx: { telegraph: boolean; swordTrail: boolean; speedLines: boolean };
  /** False while the round is not running (fighters are frozen mid-swing): no arcs, no trails. */
  combatLive: boolean;
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
  private readonly viewTrail = new SwordTrail(teamColor(0));
  private readonly trails = new Map<number, SwordTrail>();
  private readonly speedLines = new SpeedLines();
  private readonly postFx: PostFx;
  /** Camera height above the feet, smoothed (lower while crouching or sliding). */
  private eyeHeight = EYE_HEIGHT;

  constructor(canvas: HTMLCanvasElement) {
    this.parts = createScene(canvas);
    this.postFx = new PostFx(this.parts.renderer, this.parts.scene, this.parts.camera);
    this.viewSword.group.scale.setScalar(VIEW_SWORD_SCALE);
    this.parts.camera.add(this.viewSword.group, this.viewTrail.mesh, this.speedLines.lines);
    this.parts.scene.add(this.particles.points);
  }

  /** Bloom on/off (setting). */
  setBloom(enabled: boolean): void {
    this.postFx.bloom = enabled;
  }

  get bloom(): boolean {
    return this.postFx.bloom;
  }

  /** Replace the displayed map. */
  setMap(map: MapDef): void {
    if (this.mapGroup) this.parts.scene.remove(this.mapGroup);
    this.mapGroup = buildMapGroup(map);
    this.parts.scene.add(this.mapGroup);
    this.parts.setTheme(map.theme ?? DEFAULT_THEME);
  }

  render(state: ViewState): void {
    const { camera, scene, sky } = this.parts;
    const fx = this.cameraFx.update(state.local, state.yaw, state.dt);
    const eyeTarget = state.local?.crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    this.eyeHeight += (eyeTarget - this.eyeHeight) * (1 - Math.exp(-20 * state.dt));
    camera.position.set(state.localPos.x + fx.x, state.localPos.y + this.eyeHeight + fx.y, state.localPos.z + fx.z);
    camera.rotation.set(state.pitch + fx.pitch, state.yaw, fx.roll);
    if (Math.abs(camera.fov - fx.fov) > 0.01) {
      camera.fov = fx.fov;
      camera.updateProjectionMatrix();
    }
    sky.group.position.copy(camera.position);
    camera.updateMatrixWorld();

    this.updateViewSword(state.local, state.animDt, state.fx, state.combatLive);
    this.updateAvatars(state, scene);
    this.updateArcs(state.combatLive ? (state.local ? [state.local, ...state.remotes] : state.remotes) : []);
    this.speedLines.update(state.local, state.dt, state.fx.speedLines);
    this.particles.update(state.animDt);
    this.postFx.render();
  }

  private updateViewSword(local: PlayerState | null, dt: number, fx: ViewState['fx'], live: boolean): void {
    if (local && local.slot !== this.viewSwordSlot) {
      // Our slot (and so our color) changed: build a sword in the right color.
      this.parts.camera.remove(this.viewSword.group);
      this.viewSword = createSword(teamColor(local.slot));
      this.viewSword.group.scale.setScalar(VIEW_SWORD_SCALE);
      this.viewSwordSlot = local.slot;
      this.parts.camera.add(this.viewSword.group);
      this.viewTrail.setColor(teamColor(local.slot));
    }
    this.viewSword.group.visible = local?.alive ?? false;
    if (!local) {
      this.viewTrail.clear();
      return;
    }
    applySwordPose(this.viewSword.group, swordPose(local), 1 - Math.exp(-28 * dt));
    const blade = this.viewSword.bladeMaterial;
    if (local.action === 'stunned') blade.emissive.setHex(FX_COLORS.stun);
    else if (isParryActive(local)) blade.emissive.setHex(FX_COLORS.parry);
    else blade.emissive.setHex(teamColor(local.slot));
    blade.emissiveIntensity = bladeGlow(local, fx.telegraph);
    this.viewTrail.update(this.viewSword.group, this.parts.camera, live && fx.swordTrail && trailEmitting(local), dt);
  }

  /** Create, update and remove avatars (and their sword trails) so they match the remote players. */
  private updateAvatars(state: ViewState, scene: THREE.Scene): void {
    for (const player of state.remotes) {
      let avatar = this.avatars.get(player.slot);
      if (!avatar) {
        avatar = new PlayerAvatar(player.slot);
        this.avatars.set(player.slot, avatar);
        scene.add(avatar.group);
      }
      let trail = this.trails.get(player.slot);
      if (!trail) {
        trail = new SwordTrail(teamColor(player.slot));
        this.trails.set(player.slot, trail);
        scene.add(trail.mesh);
      }
      if (state.animDt > 0) avatar.update(player, state.animDt, state.windupCue, state.fx.telegraph);
      trail.update(avatar.sword, scene, state.combatLive && state.fx.swordTrail && trailEmitting(player), state.animDt);
    }
    for (const [slot, avatar] of this.avatars) {
      if (state.remotes.some((p) => p.slot === slot)) continue;
      scene.remove(avatar.group);
      this.avatars.delete(slot);
      const trail = this.trails.get(slot);
      if (trail) scene.remove(trail.mesh);
      this.trails.delete(slot);
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
