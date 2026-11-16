/**
 * The game's sounds, each one a small recipe of tones and noise (see audioEngine.ts).
 * To change how something sounds, edit its recipe here. To add a sound: add a name to
 * `SoundName` and a recipe to `RECIPES`, then call `playSound` where it should be heard
 * (usually in app/effects.ts).
 */
import type { AudioEngine, Placement } from './audioEngine';

export type SoundName =
  | 'swing'
  | 'swingDash'
  | 'hit'
  | 'parry'
  | 'dash'
  | 'jump'
  | 'doubleJump'
  | 'padLaunch'
  | 'clash'
  | 'wallJump'
  | 'land'
  | 'fall'
  | 'death'
  | 'stunned'
  | 'countdown'
  | 'go'
  | 'roundWon'
  | 'roundLost'
  | 'matchWon'
  | 'matchLost'
  | 'click';

type Recipe = (audio: AudioEngine, place: Placement) => void;

/** Play a short melody: one tone per frequency. */
function melody(audio: AudioEngine, notes: number[], step: number, type: OscillatorType, gain: number): void {
  notes.forEach((from, i) => audio.tone({ type, from, duration: step * 1.8, gain, delay: i * step }));
}

const RECIPES: Record<SoundName, Recipe> = {
  // Sword through the air: a short hiss that sweeps upward.
  swing: (a, p) => a.noise({ filter: 'bandpass', from: 700, to: 2600, q: 2.5, duration: 0.2, gain: 0.5 }, p),
  swingDash: (a, p) => {
    a.noise({ filter: 'bandpass', from: 500, to: 3800, q: 3, duration: 0.26, gain: 0.6 }, p);
    a.tone({ type: 'sawtooth', from: 180, to: 520, duration: 0.2, gain: 0.08 }, p);
  },
  // The blade connects: a sharp slice, a wet thud and a low boom.
  hit: (a, p) => {
    a.noise({ filter: 'highpass', from: 3500, duration: 0.09, gain: 0.5 }, p);
    a.noise({ filter: 'lowpass', from: 1400, to: 300, duration: 0.22, gain: 0.7 }, p);
    a.tone({ type: 'sine', from: 170, to: 45, duration: 0.35, gain: 0.7 }, p);
  },
  // Steel on steel: several high tones that do not fit together = metallic "clang".
  parry: (a, p) => {
    for (const [from, gain] of [[1318, 0.22], [1987, 0.18], [2713, 0.14], [3541, 0.1], [4460, 0.07]]) {
      a.tone({ type: 'triangle', from, to: from * 0.985, duration: 0.7, gain }, p);
    }
    a.noise({ filter: 'highpass', from: 5000, duration: 0.06, gain: 0.6 }, p);
    a.tone({ type: 'square', from: 520, to: 260, duration: 0.08, gain: 0.12 }, p);
  },
  // Dash: a quick rush of air plus a rising electric zip.
  dash: (a, p) => {
    a.noise({ filter: 'bandpass', from: 300, to: 2200, q: 1.2, duration: 0.24, gain: 0.55 }, p);
    a.tone({ type: 'sawtooth', from: 110, to: 660, duration: 0.16, gain: 0.07 }, p);
  },
  jump: (a, p) => a.tone({ type: 'sine', from: 200, to: 340, duration: 0.1, gain: 0.16 }, p),
  // Second jump in the air: a brighter blip with a puff of air.
  doubleJump: (a, p) => {
    a.tone({ type: 'triangle', from: 380, to: 760, duration: 0.12, gain: 0.2 }, p);
    a.noise({ filter: 'bandpass', from: 1200, to: 2400, q: 2, duration: 0.1, gain: 0.2 }, p);
  },
  // Jump pad: a rising electric "boing".
  padLaunch: (a, p) => {
    a.tone({ type: 'sawtooth', from: 120, to: 900, duration: 0.3, gain: 0.14 }, p);
    a.tone({ type: 'sine', from: 240, to: 1400, duration: 0.35, gain: 0.2 }, p);
    a.noise({ filter: 'highpass', from: 2500, duration: 0.12, gain: 0.25 }, p);
  },
  // Two blades meet: like a parry, but harsher and doubled.
  clash: (a, p) => {
    for (const [from, gain] of [[980, 0.22], [1560, 0.2], [2330, 0.16], [3120, 0.12]]) {
      a.tone({ type: 'square', from, to: from * 0.97, duration: 0.35, gain: gain * 0.5 }, p);
      a.tone({ type: 'triangle', from: from * 1.5, to: from * 1.47, duration: 0.5, gain }, p);
    }
    a.noise({ filter: 'highpass', from: 4000, duration: 0.09, gain: 0.7 }, p);
  },
  wallJump: (a, p) => {
    a.tone({ type: 'sine', from: 260, to: 520, duration: 0.12, gain: 0.2 }, p);
    a.noise({ filter: 'lowpass', from: 900, duration: 0.07, gain: 0.3 }, p);
  },
  land: (a, p) => {
    a.tone({ type: 'sine', from: 110, to: 50, duration: 0.14, gain: 0.45 }, p);
    a.noise({ filter: 'lowpass', from: 500, duration: 0.1, gain: 0.3 }, p);
  },
  // Falling into the abyss: a long whistle going down, then a far-away thud.
  fall: (a, p) => {
    a.tone({ type: 'sine', from: 950, to: 110, duration: 0.95, gain: 0.3 }, p);
    a.noise({ filter: 'bandpass', from: 1800, to: 250, q: 1.5, duration: 0.95, gain: 0.25 }, p);
    a.tone({ type: 'sine', from: 80, to: 35, duration: 0.5, gain: 0.5, delay: 0.9 }, p);
  },
  // We got killed: a harsh buzz dropping away.
  death: (a, p) => {
    a.tone({ type: 'sawtooth', from: 420, to: 40, duration: 0.6, gain: 0.3 }, p);
    a.noise({ filter: 'lowpass', from: 2500, to: 150, duration: 0.5, gain: 0.5 }, p);
  },
  stunned: (a, p) => {
    a.tone({ type: 'square', from: 140, to: 90, duration: 0.3, gain: 0.14 }, p);
    a.tone({ type: 'square', from: 147, to: 96, duration: 0.3, gain: 0.14 }, p);
  },
  countdown: (a) => a.tone({ type: 'square', from: 660, duration: 0.12, gain: 0.14 }),
  go: (a) => a.tone({ type: 'square', from: 990, to: 1320, duration: 0.32, gain: 0.18 }),
  roundWon: (a) => melody(a, [523, 659, 784], 0.09, 'triangle', 0.22),
  roundLost: (a) => melody(a, [392, 330, 262], 0.11, 'triangle', 0.2),
  matchWon: (a) => melody(a, [523, 659, 784, 1047, 784, 1047], 0.12, 'triangle', 0.26),
  matchLost: (a) => melody(a, [392, 370, 330, 262, 196], 0.16, 'sawtooth', 0.1),
  click: (a) => a.tone({ type: 'sine', from: 880, duration: 0.04, gain: 0.1 }),
};

export function playSound(audio: AudioEngine, name: SoundName, place: Placement = { pan: 0, gain: 1 }): void {
  RECIPES[name](audio, place);
}
