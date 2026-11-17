/**
 * All colors of the look in one place (0xRRGGBB). Change them here to re-theme the game.
 */

/** Glow color of each player, by slot. */
export const TEAM_COLORS = [0x25d8ff, 0xff3d9a];

export const SKY_COLORS = {
  top: 0x03040c,
  middle: 0x1a1246,
  horizon: 0xb8327a,
  /** Fog and the mist in the abyss use this color. */
  fog: 0x1b1238,
  moon: 0xffd9ec,
  buildings: 0x090b18,
};

export const FX_COLORS = {
  hit: 0xff5a3c,
  hitCore: 0xffffff,
  parry: 0x9fe8ff,
  clash: 0xffe08a,
  /** Jump pads and their sparks. */
  pad: 0x7dff5a,
  stun: 0xf2c744,
  /** Wind-up cue: ring and blade of an enemy whose swing is coming. */
  windup: 0xff2424,
  dust: 0x8a93b8,
};

export function teamColor(slot: number): number {
  return TEAM_COLORS[slot % TEAM_COLORS.length];
}
