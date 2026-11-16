/**
 * Sound output with the Web Audio API. There are NO sound files: every sound is built
 * from two ingredients, generated on the fly:
 *   tone  - an oscillator whose pitch glides from one frequency to another
 *   noise - random hiss, shaped by a filter (whoosh, thump, sparkle)
 * sounds.ts combines them into the actual game sounds.
 *
 * Browsers only allow sound after the user has clicked or pressed a key once -
 * call `unlock()` from such an event.
 */

export interface ToneOptions {
  type: OscillatorType;
  /** Start and end frequency in Hz. */
  from: number;
  to?: number;
  duration: number;
  /** Loudness 0..1. */
  gain: number;
  /** Seconds to wait before the sound starts. */
  delay?: number;
}

export interface NoiseOptions {
  filter: BiquadFilterType;
  /** Start and end frequency of the filter in Hz. */
  from: number;
  to?: number;
  /** Sharpness of the filter (higher = more "whistling"). */
  q?: number;
  duration: number;
  gain: number;
  delay?: number;
}

/** Where a sound comes from: -1 = left, 1 = right; `gain` scales the loudness (distance). */
export interface Placement {
  pan: number;
  gain: number;
}

const CENTER: Placement = { pan: 0, gain: 1 };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.6;
  private muted = false;
  /** The continuous scraping sound while wall-running. */
  private scrape: GainNode | null = null;

  /** Create the audio context. Safe to call many times. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext;
    if (!Ctor) return; // very old browser: stay silent
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.applyVolume();

    // Two seconds of random numbers = white noise.
    const length = this.ctx.sampleRate * 2;
    this.noiseBuffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyVolume();
  }

  /** Returns the new state: true = muted. */
  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolume();
    return this.muted;
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.volume;
  }

  /** Connect a sound source to the output, at a position between the left and right speaker. */
  private output(place: Placement): AudioNode | null {
    if (!this.ctx || !this.master) return null;
    if (Math.abs(place.pan) < 0.01 || !this.ctx.createStereoPanner) return this.master;
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.min(1, Math.max(-1, place.pan));
    panner.connect(this.master);
    return panner;
  }

  /** A gain node that fades in very quickly and then fades out over `duration`. */
  private envelope(start: number, duration: number, gain: number): GainNode {
    const node = this.ctx!.createGain();
    node.gain.setValueAtTime(0.0001, start);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + Math.min(0.01, duration / 4));
    node.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    return node;
  }

  tone(o: ToneOptions, place: Placement = CENTER): void {
    const out = this.output(place);
    if (!this.ctx || !out) return;
    const start = this.ctx.currentTime + (o.delay ?? 0);
    const osc = this.ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, start);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, start + o.duration);
    const gain = this.envelope(start, o.duration, o.gain * place.gain);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + o.duration + 0.05);
  }

  noise(o: NoiseOptions, place: Placement = CENTER): void {
    const out = this.output(place);
    if (!this.ctx || !out || !this.noiseBuffer) return;
    const start = this.ctx.currentTime + (o.delay ?? 0);
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = o.filter;
    filter.Q.value = o.q ?? 1;
    filter.frequency.setValueAtTime(o.from, start);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, start + o.duration);
    const gain = this.envelope(start, o.duration, o.gain * place.gain);
    source.connect(filter).connect(gain).connect(out);
    source.start(start, Math.random()); // random offset: no two bursts sound identical
    source.stop(start + o.duration + 0.05);
  }

  /** Switch the wall-run scraping sound on or off (it fades softly). */
  setScrape(on: boolean): void {
    if (!this.ctx || !this.master || !this.noiseBuffer) return;
    if (!this.scrape) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1400;
      filter.Q.value = 0.8;
      this.scrape = this.ctx.createGain();
      this.scrape.gain.value = 0;
      source.connect(filter).connect(this.scrape).connect(this.master);
      source.start();
    }
    this.scrape.gain.setTargetAtTime(on ? 0.11 : 0, this.ctx.currentTime, 0.05);
  }
}
